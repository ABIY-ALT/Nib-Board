import { requireUser, HttpError } from '@/lib/auth';
import { handle } from '@/lib/handler';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** A notification is private to its recipient. */
export async function POST(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;

    // Scoped by recipient in the same statement, so someone else's
    // notification is never even read, let alone marked.
    const updated = await prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { isRead: true },
    });

    if (updated.count === 0) {
      const exists = await prisma.notification.findUnique({
        where: { id },
        select: { id: true },
      });
      throw exists
        ? new HttpError(403, 'Access Denied: this notification is not addressed to you.')
        : new HttpError(404, 'Notification not found');
    }

    return { ok: true };
  });
}
