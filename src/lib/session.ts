import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { prisma, type Db } from './prisma';
import { Role, User } from './types';

export const SESSION_COOKIE = 'nib_session';

/** Idle timeout: a session unused for this long is dead. */
const IDLE_TIMEOUT_MINUTES = 30;

/** Absolute lifetime: a session is never valid beyond this, however active. */
const ABSOLUTE_TIMEOUT_HOURS = 8;

/**
 * The cookie carries a 256-bit random token; the database stores only its
 * SHA-256 hash. Anyone reading the sessions table therefore learns nothing that
 * can be replayed as a session. A plain hash (rather than a slow KDF) is right
 * here because the token is full-entropy random — there is nothing to guess.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface SessionContext {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Why a session was revoked, as stored in sessions.revoked_reason. Named here
 * so that sessionStatus() can tell a signed-out browser why its session ended;
 * rows written before these constants existed carry the same strings.
 */
export const REVOKED = {
  SUPERSEDED: 'superseded by new sign-in',
  SIGNED_OUT: 'signed out',
  SIGNED_OUT_EVERYWHERE: 'signed out of all sessions',
  PASSWORD_CHANGED: 'password changed',
  PASSWORD_SET: 'password set via setup link',
  PASSWORD_RESET: 'password reset by administrator',
  ACCOUNT_CHANGED: 'account changed by administrator',
  ACCOUNT_DEACTIVATED: 'account deactivated',
} as const;

/** The predicate a session row must meet to be usable at `now`. */
function liveAt(now: Date) {
  return { revokedAt: null, expiresAt: { gt: now }, absoluteExpiresAt: { gt: now } };
}

/**
 * Issues a new session and returns the raw token for the cookie.
 *
 * Any existing sessions for the user are revoked first, which does two jobs.
 * Sign-in rotates the session identifier, so a token captured before
 * authentication cannot be reused afterwards (session fixation). And an account
 * has at most one open session (security assessment VA-002): signing in from a
 * second browser ends the first, whose holder is told why the next time it
 * checks in. `superseded` counts the live sessions that were ended this way.
 *
 * Callers update the users row earlier in the same transaction, and that row
 * lock serializes concurrent sign-ins to one account, so two cannot both find
 * nothing to revoke and both stay open.
 */
export async function createSession(
  db: Db,
  userId: string,
  ctx: SessionContext
): Promise<{ token: string; expiresAt: Date; superseded: number }> {
  const superseded = await db.session.updateMany({
    where: { userId, ...liveAt(new Date()) },
    data: { revokedAt: new Date(), revokedReason: REVOKED.SUPERSEDED },
  });
  // Expired sessions are closed off too, so none is ever left unrevoked.
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: REVOKED.SUPERSEDED },
  });

  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = new Date(now + IDLE_TIMEOUT_MINUTES * 60_000);

  await db.session.create({
    data: {
      id: randomBytes(16).toString('hex'),
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      absoluteExpiresAt: new Date(now + ABSOLUTE_TIMEOUT_HOURS * 3_600_000),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });

  return { token, expiresAt, superseded: superseded.count };
}

/**
 * Whether an outstanding password change actually gates the account.
 *
 * Administrators are exempt. The ADMIN account is the one used to recover the
 * others — provisioning an officer, resetting a credential, reactivating a
 * locked account — so gating it behind its own forced change is the one case
 * where the gate can lock the whole system out of itself. Every other role is
 * still stopped at the password-change screen until the temporary credential is
 * replaced.
 *
 * This is the single place that decision is made; both the sign-in route and
 * session resolution go through it, so the two cannot drift apart.
 */
export function passwordChangeEnforced(role: Role | string, mustChangePassword: boolean): boolean {
  return mustChangePassword && role !== 'ADMIN';
}

/**
 * Resolves a session token to its user, sliding the idle window forward.
 *
 * Returns null for anything not currently valid — unknown, revoked, idle-timed
 * out or past its absolute lifetime. The caller turns that into a 401; there is
 * no path by which an invalid session yields a principal.
 *
 * The slide is an `updateMany` carrying the full liveness predicate rather than
 * a read followed by a write, so a session revoked concurrently is never
 * refreshed: if the update matched nothing, the session was not live.
 */
export async function resolveSession(
  token: string | undefined
): Promise<{ user: User; mustChangePassword: boolean } | null> {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const now = new Date();

  const slid = await prisma.session.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: now },
      absoluteExpiresAt: { gt: now },
    },
    data: {
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + IDLE_TIMEOUT_MINUTES * 60_000),
    },
  });

  if (slid.count === 0) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          title: true,
          businessArea: true,
          department: true,
          phone: true,
          isActive: true,
          mustChangePassword: true,
        },
      },
    },
  });

  const account = session?.user;

  // The account was deactivated while the session was live.
  if (!account || !account.isActive) {
    await prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'account deactivated' },
    });
    return null;
  }

  return {
    user: {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role as Role,
      title: account.title,
      businessArea: account.businessArea,
      department: account.department ?? undefined,
      phone: account.phone ?? undefined,
    },
    mustChangePassword: passwordChangeEnforced(account.role, account.mustChangePassword),
  };
}

/**
 * Whether a token names a live session, without touching it.
 *
 * For src/proxy.ts, which only needs to know whether a cookie is still worth
 * presenting. Unlike resolveSession() it does not slide the idle window: a
 * page load is not activity, and the API calls that follow it slide the window
 * themselves.
 */
export async function isSessionLive(token: string): Promise<boolean> {
  const now = new Date();
  const live = await prisma.session.count({
    where: {
      tokenHash: hashToken(token),
      revokedAt: null,
      expiresAt: { gt: now },
      absoluteExpiresAt: { gt: now },
      user: { isActive: true },
    },
  });
  return live > 0;
}

export type SessionEndReason =
  | 'superseded'
  | 'signed-out'
  | 'signed-out-everywhere'
  | 'password-changed'
  | 'password-reset'
  | 'account-changed'
  | 'account-deactivated'
  | 'idle-timeout'
  | 'absolute-timeout'
  | 'ended';

/** What the signed-out browser is told, keyed by the reason its session ended. */
export const SESSION_END_MESSAGE: Record<SessionEndReason, string> = {
  superseded:
    'Your account was signed in from another browser or device, which ended this session. ' +
    'Only one session per account can be open at a time. If that was not you, sign in and ' +
    'change your password straight away.',
  'signed-out': 'You have been signed out.',
  'signed-out-everywhere': 'Your account was signed out of every session.',
  'password-changed':
    'Your password was changed, which ended this session. Sign in with the new password.',
  'password-reset':
    'An administrator reset your password, which ended this session. Use the link in the ' +
    'reset email to choose a new one.',
  'account-changed': 'An administrator changed your account. Sign in again to continue.',
  'account-deactivated': 'Your account has been deactivated. Contact the system administrator.',
  'idle-timeout': `You were signed out after ${IDLE_TIMEOUT_MINUTES} minutes without activity.`,
  'absolute-timeout': `Your session reached its ${ABSOLUTE_TIMEOUT_HOURS}-hour limit. Sign in again to continue.`,
  ended: 'Your session has ended. Sign in again to continue.',
};

const REASON_BY_REVOCATION: Record<string, SessionEndReason> = {
  [REVOKED.SUPERSEDED]: 'superseded',
  [REVOKED.SIGNED_OUT]: 'signed-out',
  [REVOKED.SIGNED_OUT_EVERYWHERE]: 'signed-out-everywhere',
  [REVOKED.PASSWORD_CHANGED]: 'password-changed',
  [REVOKED.PASSWORD_SET]: 'password-changed',
  [REVOKED.PASSWORD_RESET]: 'password-reset',
  [REVOKED.ACCOUNT_CHANGED]: 'account-changed',
  [REVOKED.ACCOUNT_DEACTIVATED]: 'account-deactivated',
};

/**
 * Whether a token's session is still live and, if not, why it ended.
 *
 * Like isSessionLive() it does not slide the idle window, so the browser can
 * ask every few seconds without keeping an unattended session alive. Whichever
 * came first, the revocation or the expiry, is reported: a session that
 * timed out and was later closed off by a new sign-in timed out.
 */
export async function sessionStatus(
  token: string | undefined
): Promise<{ live: true } | { live: false; reason: SessionEndReason }> {
  if (!token) return { live: false, reason: 'ended' };

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      expiresAt: true,
      absoluteExpiresAt: true,
      revokedAt: true,
      revokedReason: true,
      user: { select: { isActive: true } },
    },
  });
  if (!session) return { live: false, reason: 'ended' };
  if (!session.user.isActive) return { live: false, reason: 'account-deactivated' };

  const timedOutAt =
    session.absoluteExpiresAt < session.expiresAt ? session.absoluteExpiresAt : session.expiresAt;

  if (session.revokedAt && session.revokedAt < timedOutAt) {
    return { live: false, reason: REASON_BY_REVOCATION[session.revokedReason ?? ''] ?? 'ended' };
  }
  if (timedOutAt <= new Date()) {
    return {
      live: false,
      reason: timedOutAt === session.absoluteExpiresAt ? 'absolute-timeout' : 'idle-timeout',
    };
  }
  return { live: true };
}

export interface LiveSessionView {
  current: boolean;
  signedInAt: string;
  lastSeenAt: string;
  ip: string | null;
  userAgent: string | null;
}

/** The account's open sessions, newest first, marking the one `currentToken` belongs to. */
export async function listLiveSessions(
  userId: string,
  currentToken: string | undefined
): Promise<LiveSessionView[]> {
  const currentHash = currentToken ? hashToken(currentToken) : null;
  const rows = await prisma.session.findMany({
    where: { userId, ...liveAt(new Date()) },
    orderBy: { createdAt: 'desc' },
    select: { tokenHash: true, createdAt: true, lastSeenAt: true, ip: true, userAgent: true },
  });
  return rows.map((s) => ({
    current: s.tokenHash === currentHash,
    signedInAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    ip: s.ip,
    userAgent: s.userAgent,
  }));
}

export async function revokeSession(token: string | undefined, reason: string): Promise<void> {
  if (!token) return;
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

export async function revokeAllSessionsForUser(
  db: Db,
  userId: string,
  reason: string
): Promise<void> {
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/** Constant-time comparison for any secret compared as a string. */
export function safeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Deliberately without Expires or Max-Age, so the cookie lasts only as long
 * as the browser and is never written to disk. The server enforces both
 * timeouts on every request. The cookie used to expire 30 minutes after
 * sign-in and was never renewed, so an officer working steadily was signed
 * out at the half hour even though the server still held the session open.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export { IDLE_TIMEOUT_MINUTES, ABSOLUTE_TIMEOUT_HOURS };
