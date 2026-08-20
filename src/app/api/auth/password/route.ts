import { requireUserAllowingPasswordChange, HttpError } from '@/lib/auth';
import { handle, readJson, badRequest } from '@/lib/handler';
import { transaction } from '@/lib/prisma';
import { hashPassword, verifyPassword, checkPasswordPolicy } from '@/lib/password';
import { createSession, revokeAllSessionsForUser, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/session';
import { assertSameOrigin, clientIp, recordAuthEvent, userAgent } from '@/lib/security';
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
      currentPassword?: string;
      newPassword?: string;
    }>(req);

    if (!currentPassword || !newPassword) {
      badRequest('currentPassword and newPassword are required.');
    }

    const policy = checkPasswordPolicy(newPassword!, { name: user.name, email: user.email });
    if (!policy.ok) {
      badRequest(`The new password ${policy.problems.join('; ')}.`);
    }

    if (currentPassword === newPassword) {
      badRequest('The new password must differ from the current one.');
    }

    return transaction(async (tx) => {
      const account = await tx.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true },
      });

      if (!(await verifyPassword(currentPassword!, account?.passwordHash ?? null))) {
        await recordAuthEvent(tx, {
          event: 'LOGIN_FAILED',
          userId: user.id,
          ip: clientIp(req),
          userAgent: userAgent(req),
          detail: 'Incorrect current password supplied during password change',
        });
        throw new HttpError(401, 'The current password is incorrect.');
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
      const { token, expiresAt } = await createSession(tx, user.id, {
        ip: clientIp(req),
        userAgent: userAgent(req),
      });

      await recordAuthEvent(tx, {
        event: 'PASSWORD_CHANGED',
        userId: user.id,
        ip: clientIp(req),
        userAgent: userAgent(req),
      });

      const store = await cookies();
      store.set(SESSION_COOKIE, token, { ...SESSION_COOKIE_OPTIONS, expires: expiresAt });

      return { ok: true };
    });
  });
}
