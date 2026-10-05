import { requireUserAllowingPasswordChange, HttpError } from '@/lib/auth';
import { handle, readJson, badRequest } from '@/lib/handler';
import { transaction } from '@/lib/prisma';
import {
  hashPassword,
  verifyPassword,
  checkPasswordPolicy,
  MAX_PASSWORD_INPUT_LENGTH,
} from '@/lib/password';
import { createSession, revokeAllSessionsForUser, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/session';
import {
  assertLoginRateLimit,
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
 */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);

    const { user } = await requireUserAllowingPasswordChange();
    const { currentPassword, newPassword } = await readJson<{
      currentPassword?: unknown;
      newPassword?: unknown;
    }>(req);

    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      !currentPassword ||
      !newPassword ||
      currentPassword.length > MAX_PASSWORD_INPUT_LENGTH
    ) {
      badRequest('currentPassword and newPassword are required.');
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
    const ip = clientIp(req);
    const ua = userAgent(req);
    await assertLoginRateLimit(ip);

    /**
     * The transaction reports a rejection rather than throwing it, so the
     * failure record, the attempt counter and any lockout survive: throwing
     * from inside would roll all of them back. Mirrors the sign-in route.
     */
    type Outcome = { ok: true } | { ok: false; status: number; message: string };

    const outcome = await transaction<Outcome>(async (tx) => {
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

      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(newPassword!),
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      await revokeAllSessionsForUser(tx, user.id, 'password changed');
      const { token, expiresAt } = await createSession(tx, user.id, { ip, userAgent: ua });

      await recordAuthEvent(tx, {
        event: 'PASSWORD_CHANGED',
        userId: user.id,
        ip,
        userAgent: ua,
      });

      const store = await cookies();
      store.set(SESSION_COOKIE, token, { ...SESSION_COOKIE_OPTIONS, expires: expiresAt });

      return { ok: true };
    });

    // Raised only after the transaction has committed, so the failure record
    // and any lockout it triggered are durable.
    if (!outcome.ok) {
      throw new HttpError(outcome.status, outcome.message);
    }
    return { ok: true };
  });
}
