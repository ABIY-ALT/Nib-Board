import { NextResponse } from 'next/server';
import { HttpError } from '@/lib/auth';
import { handle, readJson, badRequest } from '@/lib/handler';
import { prisma, transaction } from '@/lib/prisma';
import {
  hashPassword,
  checkPasswordPolicy,
  checkNotCompromised,
  MAX_PASSWORD_INPUT_LENGTH,
  MAX_PASSWORD_REQUEST_BYTES,
} from '@/lib/password';
import { resolveSetupToken, consumeSetupToken } from '@/lib/setup-token';
import { revokeAllSessionsForUser, REVOKED } from '@/lib/session';
import {
  assertPasswordChangeRateLimit,
  clientIp,
  recordAuthEvent,
  userAgent,
} from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Validates a setup token.
 *
 * Public — no session required. Returns the officer's name so the UI can
 * greet them, or 400/404 if the token is invalid. The distinction between an
 * unknown, expired and already-used token is deliberately hidden from the
 * caller; all three return the same message.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Missing token.' }, { status: 400 });
  }

  const result = await resolveSetupToken(token);
  if (!result) {
    return NextResponse.json(
      { error: 'This setup link is invalid or has expired. Please contact your administrator.' },
      { status: 404 }
    );
  }

  return NextResponse.json({ name: result.name });
}

/**
 * Sets the password for a setup-token holder.
 *
 * Public — no session required. The token proves the caller received the
 * invitation email. On success the password is set, the token consumed, and
 * the caller is redirected to the login page (the API just returns ok; the
 * frontend handles the redirect).
 *
 * The checks run cheapest first, as on a password change (security assessment
 * VA-005, VA-006): the request's size and shape, the token, the password
 * rules, the per-account limit, and only then the breach lookup.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { token, newPassword } = await readJson<{
      token?: string;
      newPassword?: string;
    }>(req, { maxBytes: MAX_PASSWORD_REQUEST_BYTES });

    if (
      typeof token !== 'string' ||
      typeof newPassword !== 'string' ||
      !token ||
      !newPassword ||
      token.length > 256
    ) {
      badRequest('token and newPassword are required.');
    }
    if (newPassword!.length > MAX_PASSWORD_INPUT_LENGTH) {
      badRequest(`The new password must be at most ${MAX_PASSWORD_INPUT_LENGTH} characters.`);
    }

    const setupUser = await resolveSetupToken(token!);
    if (!setupUser) {
      throw new HttpError(
        404,
        'This setup link is invalid or has expired. Please contact your administrator.'
      );
    }

    const policy = checkPasswordPolicy(newPassword!, {
      name: setupUser.name,
      email: setupUser.email,
    });
    if (!policy.ok) {
      badRequest(`The new password ${policy.problems.join('; ')}.`);
    }

    const ip = clientIp(req);
    const ua = userAgent(req);
    await assertPasswordChangeRateLimit(setupUser.userId, { ip, userAgent: ua });

    const breach = await checkNotCompromised(newPassword!);
    if (!breach.ok) {
      await recordAuthEvent(prisma, {
        event: 'PASSWORD_CHANGE_REJECTED',
        userId: setupUser.userId,
        emailAttempted: setupUser.email,
        ip,
        userAgent: ua,
        detail: 'Password from setup link refused as a known breached password',
      });
      badRequest(`The new password ${breach.problems.join('; ')}.`);
    }

    await transaction(async (tx) => {
      // Consume the token first, so it cannot be reused. Two requests racing
      // with the same link both pass the check above; only one consumes it,
      // and the other is refused here before it can set a password.
      if (!(await consumeSetupToken(tx, token!))) {
        throw new HttpError(
          404,
          'This setup link is invalid or has expired. Please contact your administrator.'
        );
      }

      // Set the password and clear the forced-change flag.
      await tx.user.update({
        where: { id: setupUser.userId },
        data: {
          passwordHash: await hashPassword(newPassword!),
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      // A setup link is also how an administrator resets a credential that
      // may have leaked, so any session opened with the old one ends here —
      // exactly as it does on a normal password change.
      await revokeAllSessionsForUser(tx, setupUser.userId, REVOKED.PASSWORD_SET);

      // Record the event in the security audit trail.
      await recordAuthEvent(tx, {
        event: 'PASSWORD_CHANGED',
        userId: setupUser.userId,
        emailAttempted: setupUser.email,
        ip,
        userAgent: ua,
        detail: 'Password set via email setup link',
      });
    });

    return { ok: true };
  });
}
