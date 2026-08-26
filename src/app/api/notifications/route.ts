import { requireUser } from '@/lib/auth';
import { handle } from '@/lib/handler';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Only the caller's own notifications are ever returned.
 *
 * A notification is about a Board matter, an announcement, or neither, so both
 * references come back optional and the client opens whichever is present. An
 * announcement whose notification is still here but which has since been
 * withdrawn simply loses its link — the row cascades away with the
 * announcement, so it cannot point at something the reader can no longer open.
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();

    const rows = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        matter: { select: { title: true } },
        announcement: { select: { title: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      matterId: r.matterId ?? undefined,
      matterTitle: r.matter?.title ?? undefined,
      announcementId: r.announcementId ?? undefined,
      title: r.title,
      message: r.message,
      type: r.type,
      priority: r.priority,
      timestamp: r.createdAt.toISOString(),
      isRead: r.isRead,
    }));
  });
}
