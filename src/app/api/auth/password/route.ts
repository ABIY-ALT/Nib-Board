import { requireUserAllowingPasswordChange, HttpError } from '@/lib/auth';
import { handle, readJson, badRequest } from '@/lib/handler';
import { prisma, transaction } from '@/lib/prisma';
import {
  hashPassword,
  verifyPassword,
  checkPasswordPolicy,
  checkNotCompromised,
  MAX_PASSWORD_INPUT_LENGTH,
  MAX_PASSWORD_REQUEST_BYTES,
} from '@/lib/password';
import {
  createSession,
  revokeAllSessionsForUser,
  REVOKED,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from '@/lib/session';
import { csrfTokenFor } from '@/lib/csrf.server';
import {
  assertLoginRateLimit,
  assertPasswordChangeRateLimit,
  assertSameOrigin,
  clientIp,
  recordAuthEvent,
  userAgent,
  LOCKOUT_MINUTES,
  MAX_FAILED_ATTEMPTS,
} from '@/lib/security';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Changes the caller's own password.
 *
 * Reachable while a forced change is outstanding — that is its purpose — but it
 * still requires the current password, so a briefly unattended session cannot
 * be used to take the account over permanently.
 *
 * On success every existing session is revoked and a fresh one issued: any
 * other device holding a session from before the change is signed out, which is
 * the expected behaviour when a password is changed because it may have leaked.
 *
 * The checks run cheapest first (security assessment VA-005, VA-006): the
 * request's size and shape, the password rules, the rate limits, the current
 * password, and only then the breach lookup, the one step that may leave the
 * server. A caller who cannot prove the current password never reaches it.
 */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);

    const { user } = await requireUserAllowingPasswordChange();
    const { currentPassword, newPassword } = await readJson<{
      currentPassword?: unknown;
      newPassword?: unknown;
    }>(req, { maxBytes: MAX_PASSWORD_REQUEST_BYTES });

    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      !currentPassword ||
      !newPassword ||
      currentPassword.length > MAX_PASSWORD_INPUT_LENGTH
    ) {
      badRequest('currentPassword and newPassword are required.');
    }
    if (newPassword!.length > MAX_PASSWORD_INPUT_LENGTH) {
      badRequest(`The new password must be at most ${MAX_PASSWORD_INPUT_LENGTH} characters.`);
    }

    const policy = checkPasswordPolicy(newPassword!, { name: user.name, email: user.email });
    if (!policy.ok) {
      badRequest(`The new password ${policy.problems.join('; ')}.`);
    }

    if (currentPassword === newPassword) {
      badRequest('The new password must differ from the current one.');
    }

    // A wrong current password is a guess at the account's credential, exactly
    // as at sign-in, so it is throttled, counted and locked out the same way.
    // Otherwise anyone holding a session — an unattended workstation, say —
    // could test candidate passwords here without limit and without trace.
    // The per-account limit then bounds how many breach lookups one account
    // can cause, whoever is asking.
    const ip = clientIp(req);
    const ua = userAgent(req);
    await assertLoginRateLimit(ip);
    await assertPasswordChangeRateLimit(user.id, { ip, userAgent: ua });

    /**
     * The transactions report a rejection rather than throwing it, so the
     * failure record, the attempt counter and any lockout survive: throwing
     * from inside would roll all of them back. Mirrors the sign-in route.
     */
    type Rejection = { ok: false; status: number; message: string };

    // First, prove the current password. Nothing is changed yet; the hash it
    // was checked against is carried forward so the change below can tell if
    // the password moved underneath it.
    const verified = await transaction<{ ok: true; passwordHash: string } | Rejection>(
      async (tx) => {
        const account = await tx.user.findUnique({
          where: { id: user.id },
          select: { passwordHash: true, lockedUntil: true },
        });

        if (account?.lockedUntil && account.lockedUntil > new Date()) {
          await recordAuthEvent(tx, {
            event: 'LOGIN_BLOCKED_LOCKED',
            userId: user.id,
            ip,
            userAgent: ua,
            detail: 'Password change refused while the account is locked',
          });
          return {
            ok: false,
            status: 423,
            message: `This account is temporarily locked after repeated failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`,
          };
        }

        if (!(await verifyPassword(currentPassword!, account?.passwordHash ?? null))) {
          const { failedLoginAttempts: attempts } = await tx.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: { increment: 1 } },
            select: { failedLoginAttempts: true },
          });
          const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
          if (shouldLock) {
            await tx.user.update({
              where: { id: user.id },
              data: { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) },
            });
          }

          await recordAuthEvent(tx, {
            event: 'LOGIN_FAILED',
            userId: user.id,
            ip,
            userAgent: ua,
            detail: `Incorrect current password supplied during password change (attempt ${attempts} of ${MAX_FAILED_ATTEMPTS})`,
          });
          if (shouldLock) {
            await recordAuthEvent(tx, {
              event: 'ACCOUNT_LOCKED',
              userId: user.id,
              ip,
              userAgent: ua,
              detail: `Locked for ${LOCKOUT_MINUTES} minutes`,
            });
          }
          return { ok: false, status: 401, message: 'The current password is incorrect.' };
        }

        return { ok: true, passwordHash: account!.passwordHash! };
      }
    );

    // Raised only after the transaction has committed, so the failure record
    // and any lockout it triggered are durable.
    if (!verified.ok) {
      throw new HttpError(verified.status, verified.message);
    }

    // Then the breach lookup, outside any transaction: a slow range service
    // must not hold a database connection open. A refusal is recorded, which
    // is what assertPasswordChangeRateLimit counts.
    const breach = await checkNotCompromised(newPassword!);
    if (!breach.ok) {
      await recordAuthEvent(prisma, {
        event: 'PASSWORD_CHANGE_REJECTED',
        userId: user.id,
        ip,
        userAgent: ua,
        detail: 'New password refused as a known breached password',
      });
      badRequest(`The new password ${breach.problems.join('; ')}.`);
    }

    const changed = await transaction<{ ok: true; csrfToken: string } | Rejection>(async (tx) => {
      // Only if the password is still the one just verified and the account
      // still active: either could have changed during the lookup above.
      const { count } = await tx.user.updateMany({
        where: { id: user.id, passwordHash: verified.passwordHash, isActive: true },
        data: {
          passwordHash: await hashPassword(newPassword!),
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      if (count === 0) {
        return {
          ok: false,
          status: 409,
          message: 'Your account changed while the new password was being checked. Try again.',
        };
      }

      await revokeAllSessionsForUser(tx, user.id, REVOKED.PASSWORD_CHANGED);
      const { token } = await createSession(tx, user.id, { ip, userAgent: ua });

      await recordAuthEvent(tx, {
        event: 'PASSWORD_CHANGED',
        userId: user.id,
        ip,
        userAgent: ua,
      });

      const store = await cookies();
      store.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);

      // The anti-CSRF token is bound to the session, which was just replaced.
      return { ok: true, csrfToken: csrfTokenFor(token) };
    });

    if (!changed.ok) {
      throw new HttpError(changed.status, changed.message);
    }
    return { ok: true, csrfToken: changed.csrfToken };
  });
}
