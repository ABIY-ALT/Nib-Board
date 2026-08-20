import { NextResponse } from 'next/server';
import { HttpError } from '@/lib/auth';
import { handle, readJson, badRequest } from '@/lib/handler';
import { transaction } from '@/lib/prisma';
import { hashPassword, checkPasswordPolicy } from '@/lib/password';
import { resolveSetupToken, consumeSetupToken } from '@/lib/setup-token';
import { clientIp, recordAuthEvent, userAgent } from '@/lib/security';

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
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { token, newPassword } = await readJson<{
      token?: string;
      newPassword?: string;
    }>(req);

    if (!token || !newPassword) {
      badRequest('token and newPassword are required.');
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

    await transaction(async (tx) => {
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

      // Consume the token so it cannot be reused.
      await consumeSetupToken(tx, token!);

      // Record the event in the security audit trail.
      await recordAuthEvent(tx, {
        event: 'PASSWORD_CHANGED',
        userId: setupUser.userId,
        emailAttempted: setupUser.email,
        ip: clientIp(req),
        userAgent: userAgent(req),
        detail: 'Password set via email setup link',
      });
    });

    return { ok: true };
  });
}
