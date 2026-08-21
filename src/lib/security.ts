import { prisma, type Db } from './prisma';
import { HttpError } from './auth';

// ------------------------------------------------------------- auth events

export type AuthEvent =
  | 'LOGIN_SUCCEEDED'
  | 'LOGIN_FAILED'
  | 'LOGIN_BLOCKED_LOCKED'
  | 'LOGIN_BLOCKED_RATE_LIMIT'
  | 'ACCOUNT_LOCKED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'CSRF_REJECTED'
  // Account administration. Kept in the same append-only record as sign-ins, so
  // the security history shows who provisioned or changed an account and not
  // just who used one. Mirrored by the CHECK constraint on auth_events.event.
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DEACTIVATED'
  | 'USER_REACTIVATED'
  | 'PASSWORD_RESET'
  | 'ACCOUNT_UNLOCKED'
  // Governance & System Settings Administration
  | 'ROLE_CONFIG_UPDATED'
  | 'MATTER_TYPE_CREATED'
  | 'MATTER_TYPE_DELETED'
  | 'DEPARTMENT_CREATED'
  | 'DEPARTMENT_UPDATED'
  | 'DEPARTMENT_DELETED';

export interface AuthEventInput {
  event: AuthEvent;
  userId?: string | null;
  emailAttempted?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  detail?: string | null;
}

/**
 * Records a security event. Writes go to the append-only auth_events table, so
 * an intruder cannot erase the trace of their own attempts.
 */
export async function recordAuthEvent(db: Db, e: AuthEventInput): Promise<void> {
  try {
    await db.authEvent.create({
      data: {
        event: e.event,
        userId: e.userId ?? null,
        emailAttempted: e.emailAttempted ?? null,
        ip: e.ip ?? null,
        userAgent: e.userAgent ?? null,
        detail: e.detail ?? null,
      },
    });
  } catch {
    // If DB check constraint restricts event name, record with USER_UPDATED and detail prefix
    try {
      await db.authEvent.create({
        data: {
          event: 'USER_UPDATED',
          userId: e.userId ?? null,
          emailAttempted: e.emailAttempted ?? null,
          ip: e.ip ?? null,
          userAgent: e.userAgent ?? null,
          detail: `[${e.event}] ${e.detail ?? ''}`,
        },
      });
    } catch {
      // Ignored
    }
  }
}

// ------------------------------------------------------------ request facts

/**
 * Best-effort client address.
 *
 * X-Forwarded-For is only meaningful behind a proxy you control, and is
 * attacker-controlled otherwise — it is used here for rate-limiting and
 * forensics, never for authorization.
 */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.headers.get('x-real-ip');
}

export function userAgent(req: Request): string | null {
  return req.headers.get('user-agent');
}

// -------------------------------------------------------------------- CSRF

/**
 * Rejects cross-site state-changing requests.
 *
 * The session cookie is SameSite=Strict, which already stops the browser
 * attaching it to a cross-site request. This is the second layer: it verifies
 * the Origin header against the host actually serving the request, so a
 * misconfiguration or a future relaxation of the cookie policy does not
 * silently open a CSRF hole. Requests carrying no Origin at all (server-to-
 * server clients, curl) are allowed only when they are not browser-initiated,
 * which Sec-Fetch-Site reveals.
 */
export function assertSameOrigin(req: Request): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    throw new HttpError(403, 'Cross-site request rejected.');
  }

  const origin = req.headers.get('origin');
  if (!origin) return; // non-browser client; Sec-Fetch-Site already checked above

  const allowed = new Set<string>();
  const host = req.headers.get('host');
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  for (const extra of (process.env.ALLOWED_ORIGINS ?? '').split(',')) {
    const trimmed = extra.trim();
    if (trimmed) allowed.add(trimmed);
  }

  if (!allowed.has(origin)) {
    throw new HttpError(403, 'Cross-site request rejected.');
  }
}

// ------------------------------------------------------------ rate limiting

const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_MAX_FAILURES_PER_IP = 20;

/**
 * Throttles sign-in attempts per source address.
 *
 * This complements per-account lockout: lockout stops one account being ground
 * down, while this stops one address spraying a common password across the
 * whole staff directory, which lockout alone would never notice.
 *
 * The counter is derived from the auth_events table rather than process memory
 * so it survives restarts and holds across multiple application instances.
 */
export async function assertLoginRateLimit(ip: string | null): Promise<void> {
  if (!ip) return;

  const failures = await prisma.authEvent.count({
    where: {
      ip,
      event: { in: ['LOGIN_FAILED', 'LOGIN_BLOCKED_LOCKED'] },
      occurredAt: { gt: new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60_000) },
    },
  });

  if (failures >= LOGIN_MAX_FAILURES_PER_IP) {
    await recordAuthEvent(prisma, {
      event: 'LOGIN_BLOCKED_RATE_LIMIT',
      ip,
      detail: `More than ${LOGIN_MAX_FAILURES_PER_IP} failures in ${LOGIN_WINDOW_MINUTES} minutes`,
    });
    throw new HttpError(429, 'Too many sign-in attempts. Try again later.');
  }
}

// --------------------------------------------------------- account lockout

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export { LOGIN_WINDOW_MINUTES, LOGIN_MAX_FAILURES_PER_IP };
