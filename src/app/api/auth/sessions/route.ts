import { cookies } from 'next/headers';
import { requireUser } from '@/lib/auth';
import { handle } from '@/lib/handler';
import { prisma, transaction } from '@/lib/prisma';
import {
  listLiveSessions,
  revokeAllSessionsForUser,
  REVOKED,
  SESSION_COOKIE,
  IDLE_TIMEOUT_MINUTES,
  ABSOLUTE_TIMEOUT_HOURS,
} from '@/lib/session';
import { issuePresessionCsrfToken } from '@/lib/csrf.server';
import { assertSameOrigin, clientIp, recordAuthEvent, userAgent, type AuthEvent } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The events about an account's own sign-ins and sessions. Administrative
 * changes made to the account (role, scope) are left to the audit log; a
 * reset or unlock is shown, because it changes how the holder signs in.
 */
const ACCOUNT_ACTIVITY: AuthEvent[] = [
  'LOGIN_SUCCEEDED',
  'LOGIN_FAILED',
  'LOGIN_BLOCKED_LOCKED',
  'ACCOUNT_LOCKED',
  'ACCOUNT_UNLOCKED',
  'LOGOUT',
  'PASSWORD_CHANGED',
  'PASSWORD_CHANGE_REJECTED',
  'PASSWORD_CHANGE_BLOCKED_RATE_LIMIT',
  'PASSWORD_RESET',
  'SESSION_REVOKED',
  'SESSION_EXPIRED',
];

const ACTIVITY_LIMIT = 25;

/**
 * The caller's own open sessions and recent sign-in activity (security
 * assessment VA-002), for the Account security page.
 *
 * Only the caller's own records, by construction: both queries are keyed by
 * the session's user and take no identifier from the request.
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const token = (await cookies()).get(SESSION_COOKIE)?.value;

    const [sessions, events] = await Promise.all([
      listLiveSessions(user.id, token),
      prisma.authEvent.findMany({
        where: { userId: user.id, event: { in: ACCOUNT_ACTIVITY } },
        // Events written in one transaction share a timestamp; the id keeps
        // them in the order they were written.
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: ACTIVITY_LIMIT,
        select: { id: true, occurredAt: true, event: true, ip: true, userAgent: true, detail: true },
      }),
    ]);

    return {
      sessions,
      activity: events.map((e) => ({
        id: e.id.toString(),
        occurredAt: e.occurredAt.toISOString(),
        event: e.event,
        ip: e.ip,
        userAgent: e.userAgent,
        detail: e.detail,
      })),
      policy: {
        maxConcurrentSessions: 1,
        idleTimeoutMinutes: IDLE_TIMEOUT_MINUTES,
        absoluteTimeoutHours: ABSOLUTE_TIMEOUT_HOURS,
      },
    };
  });
}

/**
 * Signs the account out of every session, this one included.
 *
 * For an account holder who suspects someone else has been using it. Every
 * other way of ending a session (signing in elsewhere, changing the password)
 * also leaves a session open; this one leaves none.
 */
export async function DELETE(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();

    await transaction(async (tx) => {
      await revokeAllSessionsForUser(tx, user.id, REVOKED.SIGNED_OUT_EVERYWHERE);
      await recordAuthEvent(tx, {
        event: 'SESSION_REVOKED',
        userId: user.id,
        ip: clientIp(req),
        userAgent: userAgent(req),
        detail: 'Signed out of every session by the account holder',
      });
    });

    (await cookies()).delete(SESSION_COOKIE);
    return { ok: true, csrfToken: await issuePresessionCsrfToken() };
  });
}
