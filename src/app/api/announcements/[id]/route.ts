import { requireUser, HttpError } from '@/lib/auth';
import { handle, readJson } from '@/lib/handler';
import { prisma, transaction } from '@/lib/prisma';
import { assertPermission, getPermissions } from '@/lib/permissions.server';
import { PERMISSIONS, hasAnyPermission, hasPermission } from '@/lib/permissions';
import {
  ANNOUNCEMENT_INCLUDE,
  auditAnnouncement,
  inAudience,
  parseAnnouncementInput,
  toAnnouncements,
  type AnnouncementRow,
} from '@/lib/announcements.server';
import { assertSameOrigin } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * One announcement.
 *
 * Two ways to be entitled to it, and a caller needs one of them: it is
 * addressed to you and live, or you hold a permission that lets you act on
 * announcements. Everything else is a 403 — including a draft addressed to you,
 * which has not been said yet.
 */
async function load(id: string): Promise<AnnouncementRow> {
  const row = await prisma.announcement.findUnique({
    where: { id },
    include: ANNOUNCEMENT_INCLUDE,
  });
  if (!row) throw new HttpError(404, 'Announcement not found');
  return row;
}

/** Is this announcement currently live for a recipient? */
function isLive(row: AnnouncementRow, now = new Date()): boolean {
  if (row.status !== 'PUBLISHED') return false;
  const start = row.publishAt ?? row.publishedAt;
  if (start && start > now) return false;
  if (row.expiresAt && row.expiresAt <= now) return false;
  return true;
}

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const permissions = await getPermissions(user);
    const row = await load(id);

    const managesOthers = hasAnyPermission(permissions, [
      PERMISSIONS.ANNOUNCEMENT_EDIT,
      PERMISSIONS.ANNOUNCEMENT_PUBLISH,
      PERMISSIONS.ANNOUNCEMENT_DELETE,
    ]);
    const isAuthor =
      row.createdById === user.id && hasPermission(permissions, PERMISSIONS.ANNOUNCEMENT_CREATE);
    const isRecipient =
      hasPermission(permissions, PERMISSIONS.ANNOUNCEMENT_VIEW) &&
      isLive(row) &&
      inAudience(row, user);

    if (!managesOthers && !isAuthor && !isRecipient) {
      throw new HttpError(
        403,
        'Access Denied: this announcement is not addressed to you and you do not have permission to manage announcements.'
      );
    }

    const [mapped] = await toAnnouncements([row], user, {
      includeReadCounts: managesOthers || isAuthor,
    });
    return mapped;
  });
}

/**
 * Amends an announcement.
 *
 * Editing a published announcement changes what its recipients see; it does not
 * raise a second round of notifications, because an amended notice is the same
 * notice. Widening the audience of something already published therefore does
 * not notify the newcomers — the announcement simply appears in their feed. If
 * a change is substantive enough to need announcing again, it is a new
 * announcement, which is also what leaves an honest record of what was said and
 * when.
 */
export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    const { id } = await params;
    await assertPermission(
      user,
      PERMISSIONS.ANNOUNCEMENT_EDIT,
      'You do not have permission to edit announcements.'
    );

    const existing = await load(id);
    if (existing.status === 'CANCELLED') {
      throw new HttpError(409, 'This announcement has been withdrawn and can no longer be edited.');
    }

    const input = parseAnnouncementInput(await readJson<Record<string, unknown>>(req));

    const updated = await prisma.announcement.update({
      where: { id },
      data: {
        title: input.title,
        message: input.message,
        type: input.type,
        priority: input.priority,
        publishAt: input.publishAt,
        expiresAt: input.expiresAt,
        targetAll: input.targetAll,
        targetUserIds: input.targetUserIds,
        targetRoles: input.targetRoles,
        targetDepartments: input.targetDepartments,
        targetBusinessAreas: input.targetBusinessAreas,
        meetingDate: input.meetingDate,
        meetingTime: input.meetingTime,
        location: input.location,
        meetingLink: input.meetingLink,
        agenda: input.agenda,
        participants: input.participants,
        relatedMatterId: input.relatedMatterId,
        reference: input.reference,
        updatedAt: new Date(),
      },
      include: ANNOUNCEMENT_INCLUDE,
    });

    await auditAnnouncement(req, user, updated, 'ANNOUNCEMENT_UPDATED', {
      note: `Previously titled '${existing.title}', ${existing.type}, priority ${existing.priority}.`,
    });

    const [mapped] = await toAnnouncements([updated], user, { includeReadCounts: true });
    return mapped;
  });
}

/**
 * Withdraws an announcement.
 *
 * A draft nobody has seen is deleted outright — there is nothing to preserve.
 * One that has been published is cancelled instead: it leaves the feed and its
 * notifications go with it, but the record of what was said, to whom and by
 * whom stays, because that is the point of an audit trail. The audit event is
 * written either way.
 */
export async function DELETE(req: Request, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    const { id } = await params;
    await assertPermission(
      user,
      PERMISSIONS.ANNOUNCEMENT_DELETE,
      'You do not have permission to withdraw announcements.'
    );

    const existing = await load(id);
    const wasPublished = existing.status === 'PUBLISHED';

    if (existing.status === 'CANCELLED') {
      throw new HttpError(409, 'This announcement has already been withdrawn.');
    }

    // The audit event is written before the row goes, so a deleted draft still
    // leaves a record of having existed.
    await auditAnnouncement(
      req,
      user,
      existing,
      wasPublished ? 'ANNOUNCEMENT_CANCELLED' : 'ANNOUNCEMENT_DELETED',
      { note: wasPublished ? 'Withdrawn from the feed; notifications removed.' : 'Unpublished draft deleted.' }
    );

    await transaction(async (tx) => {
      if (wasPublished) {
        await tx.announcement.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledById: user.id,
            updatedAt: new Date(),
          },
        });
        // The notice is withdrawn, so the notifications pointing at it go too:
        // leaving them would put an item in people's bell that opens nothing.
        await tx.notification.deleteMany({ where: { announcementId: id } });
      } else {
        await tx.announcement.delete({ where: { id } });
      }
    });

    return { ok: true, cancelled: wasPublished, deleted: !wasPublished };
  });
}
