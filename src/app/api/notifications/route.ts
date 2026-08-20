import { requireUser } from '@/lib/auth';
import { handle } from '@/lib/handler';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Only the caller's own notifications are ever returned. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();

    const rows = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { matter: { select: { title: true } } },
    });

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      matterId: r.matterId,
      matterTitle: r.matter.title,
      title: r.title,
      message: r.message,
      type: r.type,
      timestamp: r.createdAt.toISOString(),
      isRead: r.isRead,
    }));
  });
}
