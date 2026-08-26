import { requireUser } from '@/lib/auth';
import { handle, readJson } from '@/lib/handler';
import { prisma, transaction } from '@/lib/prisma';
import { generateId } from '@/lib/repo';
import { assertPermission, getPermissions } from '@/lib/permissions.server';
import { PERMISSIONS, hasAnyPermission } from '@/lib/permissions';
import {
  ANNOUNCEMENT_INCLUDE,
  auditAnnouncement,
  dispatchAnnouncementEmails,
  feedWhere,
  parseAnnouncementInput,
  publishAnnouncement,
  toAnnouncements,
  type AudienceMember,
} from '@/lib/announcements.server';
import { assertSameOrigin } from '@/lib/security';
import type { Prisma } from '@/generated/prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Announcements.
 *
 * Two readings of the same table, decided by permission rather than by role:
 *
 *   * `scope=feed` (the default) is what an announcement is *for* — the live
 *     notices addressed to the caller. Needs ANNOUNCEMENT_VIEW.
 *   * `scope=manage` is the authoring view — drafts, scheduled, expired and
 *     withdrawn announcements as well. Needs one of the authoring permissions,
 *     and someone who may only create sees only what they wrote.
 *
 * The audience predicate is applied in the query rather than after it, so an
 * announcement outside the caller's audience is never loaded, let alone
 * filtered out of a response.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const permissions = await getPermissions(user);

    const scope = new URL(req.url).searchParams.get('scope') === 'manage' ? 'manage' : 'feed';

    if (scope === 'feed') {
      await assertPermission(
        user,
        PERMISSIONS.ANNOUNCEMENT_VIEW,
        'You do not have permission to view announcements.'
      );

      const rows = await prisma.announcement.findMany({
        where: feedWhere(user),
        include: ANNOUNCEMENT_INCLUDE,
        orderBy: [{ publishAt: 'desc' }, { createdAt: 'desc' }],
        take: 200,
      });
      return toAnnouncements(rows, user);
    }

    const canAuthor = hasAnyPermission(permissions, [
      PERMISSIONS.ANNOUNCEMENT_CREATE,
      PERMISSIONS.ANNOUNCEMENT_EDIT,
      PERMISSIONS.ANNOUNCEMENT_PUBLISH,
      PERMISSIONS.ANNOUNCEMENT_DELETE,
    ]);
    if (!canAuthor) {
      await assertPermission(
        user,
        PERMISSIONS.ANNOUNCEMENT_CREATE,
        'You do not have permission to manage announcements.'
      );
    }

    // Someone who may only create sees what they wrote; the permissions that
    // act on other people's announcements are what widen this.
    const managesOthers = hasAnyPermission(permissions, [
      PERMISSIONS.ANNOUNCEMENT_EDIT,
      PERMISSIONS.ANNOUNCEMENT_PUBLISH,
      PERMISSIONS.ANNOUNCEMENT_DELETE,
    ]);
    const where: Prisma.AnnouncementWhereInput = managesOthers ? {} : { createdById: user.id };

    const rows = await prisma.announcement.findMany({
      where,
      include: ANNOUNCEMENT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }],
      take: 300,
    });
    return toAnnouncements(rows, user, { includeReadCounts: true });
  });
}

/**
 * Drafts a new announcement, optionally publishing it in the same request.
 *
 * Creating and publishing are separate permissions, so "save and send now" is
 * checked twice: an officer who may draft but not release is refused the
 * release explicitly, rather than having it silently downgraded to a draft they
 * think went out.
 */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    await assertPermission(
      user,
      PERMISSIONS.ANNOUNCEMENT_CREATE,
      'You do not have permission to create announcements.'
    );

    const body = await readJson<Record<string, unknown>>(req);
    const publishNow = body.publish === true;
    if (publishNow) {
      await assertPermission(
        user,
        PERMISSIONS.ANNOUNCEMENT_PUBLISH,
        'You may draft an announcement but not publish it. Ask an officer who holds the publish permission to release it.'
      );
    }

    const input = parseAnnouncementInput(body);
    const now = new Date();

    const result = await transaction(async (tx) => {
      const created = await tx.announcement.create({
        data: {
          id: generateId('ann'),
          title: input.title,
          message: input.message,
          type: input.type,
          priority: input.priority,
          status: 'DRAFT',
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
          createdById: user.id,
          createdAt: now,
          updatedAt: now,
        },
        include: ANNOUNCEMENT_INCLUDE,
      });

      if (!publishNow) {
        return { row: created, recipients: [] as AudienceMember[] };
      }

      const { recipients } = await publishAnnouncement(tx, created, user, now);
      const published = (await tx.announcement.findUnique({
        where: { id: created.id },
        include: ANNOUNCEMENT_INCLUDE,
      }))!;
      return { row: published, recipients };
    });

    await auditAnnouncement(
      req,
      user,
      result.row,
      publishNow ? 'ANNOUNCEMENT_PUBLISHED' : 'ANNOUNCEMENT_CREATED',
      { recipientCount: publishNow ? result.recipients.length : undefined }
    );

    if (publishNow) {
      await dispatchAnnouncementEmails(req, user, result.row, result.recipients);
    }

    const [mapped] = await toAnnouncements([result.row], user, { includeReadCounts: true });
    return mapped;
  });
}
