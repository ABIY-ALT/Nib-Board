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
 * Issues a new session and returns the raw token for the cookie.
 *
 * Any existing sessions for the user are revoked first: sign-in rotates the
 * session identifier, so a token captured before authentication cannot be
 * reused afterwards (session fixation).
 */
export async function createSession(
  db: Db,
  userId: string,
  ctx: SessionContext
): Promise<{ token: string; expiresAt: Date }> {
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: 'superseded by new sign-in' },
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

  return { token, expiresAt };
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

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export { IDLE_TIMEOUT_MINUTES, ABSOLUTE_TIMEOUT_HOURS };
