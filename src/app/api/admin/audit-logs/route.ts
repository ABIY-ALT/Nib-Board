import { requireUser } from '@/lib/auth';
import { assertRole } from '@/lib/authz';
import { handle } from '@/lib/handler';
import { prisma } from '@/lib/prisma';
import { USER_ADMIN_ROLES } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    assertRole(
      user,
      ['BOARD_SECRETARIAT', 'BOARD_MEMBER', 'ADMIN'],
      'Only Board Secretariat, Board Members, or Administrators may view the System Audit Log.'
    );

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') || '100'), 500);
    const eventFilter = url.searchParams.get('event');

    const where: Record<string, unknown> = {};
    if (eventFilter && eventFilter !== 'ALL') {
      where.event = eventFilter;
    }

    const events = await prisma.authEvent.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            title: true,
          },
        },
      },
    });

    // BigInt id serialization
    const serialized = events.map((e) => ({
      id: String(e.id),
      event: e.event,
      occurredAt: e.occurredAt.toISOString(),
      userId: e.userId,
      emailAttempted: e.emailAttempted,
      ip: e.ip,
      userAgent: e.userAgent,
      detail: e.detail,
      user: e.user,
    }));

    return { events: serialized };
  });
}
