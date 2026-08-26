import { requireUser, HttpError } from '@/lib/auth';
import { handle } from '@/lib/handler';
import { prisma } from '@/lib/prisma';
import { assertPermission } from '@/lib/permissions.server';
import { PERMISSIONS } from '@/lib/permissions';
import { ANNOUNCEMENT_INCLUDE, auditAnnouncement, inAudience, recordRead } from '@/lib/announcements.server';
import { assertSameOrigin } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Records that the caller has read an announcement.
 *
 * Only a genuine recipient can leave a receipt: someone who can reach the
 * announcement because they manage announcements is not in its audience, and
 * counting them would misreport how many of the people it was for have actually
 * seen it.
 *
 * The receipt is written once, and the "viewed" audit event is derived from
 * that first write. Auditing every open instead would put a row in the security
 * record every time somebody scrolled past a notice, which buries the events
 * that matter.
 */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    const { id } = await params;
    await assertPermission(
      user,
      PERMISSIONS.ANNOUNCEMENT_VIEW,
      'You do not have permission to view announcements.'
    );

    const row = await prisma.announcement.findUnique({
      where: { id },
      include: ANNOUNCEMENT_INCLUDE,
    });
    if (!row) throw new HttpError(404, 'Announcement not found');

    if (row.status !== 'PUBLISHED' || !inAudience(row, user)) {
      throw new HttpError(403, 'Access Denied: this announcement is not addressed to you.');
    }

    const firstTime = await recordRead(prisma, id, user.id);

    // The bell entry and the announcement are the same thing to the reader, so
    // opening one settles the other.
    await prisma.notification.updateMany({
      where: { announcementId: id, userId: user.id, isRead: false },
      data: { isRead: true },
    });

    if (firstTime) {
      await auditAnnouncement(req, user, row, 'ANNOUNCEMENT_VIEWED', {
        note: `Read by ${user.name} (${user.title}).`,
      });
    }

    return { ok: true, firstTime };
  });
}
