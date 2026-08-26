import { requireUser, HttpError } from '@/lib/auth';
import { handle } from '@/lib/handler';
import { prisma, transaction } from '@/lib/prisma';
import { assertPermission } from '@/lib/permissions.server';
import { PERMISSIONS } from '@/lib/permissions';
import {
  ANNOUNCEMENT_INCLUDE,
  auditAnnouncement,
  dispatchAnnouncementEmails,
  publishAnnouncement,
  toAnnouncements,
} from '@/lib/announcements.server';
import { assertSameOrigin } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Releases a drafted announcement to its audience.
 *
 * Publishing is the act that reaches people, so it is its own permission and
 * its own endpoint rather than a status field anybody who may edit can flip.
 * An announcement is published once: republishing would raise a second round of
 * notifications for something already said, so it is refused.
 */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    const { id } = await params;
    await assertPermission(
      user,
      PERMISSIONS.ANNOUNCEMENT_PUBLISH,
      'You do not have permission to publish announcements.'
    );

    const existing = await prisma.announcement.findUnique({
      where: { id },
      include: ANNOUNCEMENT_INCLUDE,
    });
    if (!existing) throw new HttpError(404, 'Announcement not found');

    if (existing.status === 'PUBLISHED') {
      throw new HttpError(409, 'This announcement has already been published.');
    }
    if (existing.status === 'CANCELLED') {
      throw new HttpError(409, 'This announcement has been withdrawn and cannot be published.');
    }

    const now = new Date();
    const result = await transaction(async (tx) => {
      const { recipients, publishAt } = await publishAnnouncement(tx, existing, user, now);
      const row = (await tx.announcement.findUnique({
        where: { id },
        include: ANNOUNCEMENT_INCLUDE,
      }))!;
      return { row, recipients, scheduled: publishAt > now };
    });

    await auditAnnouncement(req, user, result.row, 'ANNOUNCEMENT_PUBLISHED', {
      recipientCount: result.recipients.length,
      note: result.scheduled
        ? `Scheduled for ${result.row.publishAt?.toISOString()}.`
        : undefined,
    });

    // A scheduled announcement is not said yet, so nothing is mailed until it
    // is — the notification fan-out holds off for the same reason.
    const emailed = result.scheduled
      ? 0
      : await dispatchAnnouncementEmails(req, user, result.row, result.recipients);

    const [mapped] = await toAnnouncements([result.row], user, { includeReadCounts: true });
    return { announcement: mapped, recipients: result.recipients.length, emailed };
  });
}
