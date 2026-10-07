import { requireUser, HttpError } from '@/lib/auth';
import { handle, readJson } from '@/lib/handler';
import { transaction } from '@/lib/prisma';
import { assertSameOrigin, clientIp, recordAuthEvent, userAgent, appOrigin } from '@/lib/security';
import { createSetupToken } from '@/lib/setup-token';
import { sendSetupEmail, sendPasswordResetEmail } from '@/lib/email';
import { assertPermission } from '@/lib/permissions.server';
import { PERMISSIONS } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Resends the invitation / password-reset email for an officer.
 *
 * Generates a fresh setup token (revoking any outstanding one) and sends the
 * email. Only available to administrators and the Board Secretariat.
 */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);

    const actor = await requireUser();
    await assertPermission(
      actor,
      PERMISSIONS.ADMINISTER_USERS,
      'Access Denied: your role does not hold the "Administer officer accounts" permission.'
    );

    const { id } = await params;

    const origin = appOrigin(req);

    return transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          passwordHash: true,
        },
      });

      if (!target) throw new HttpError(404, 'Officer account not found.');
      if (!target.isActive) throw new HttpError(400, 'Cannot send email to a deactivated account.');

      const token = await createSetupToken(tx, target.id);
      const setupUrl = `${origin}/setup-password?token=${token}`;

      // If the user has never set a password, this is a welcome invitation.
      // If they had one and it was reset, this is a password-reset email.
      if (target.passwordHash === null) {
        await sendSetupEmail(target.email, target.name, setupUrl);
      } else {
        await sendPasswordResetEmail(target.email, target.name, setupUrl);
      }

      await recordAuthEvent(tx, {
        event: 'PASSWORD_RESET',
        userId: target.id,
        emailAttempted: target.email,
        ip: clientIp(req),
        userAgent: userAgent(req),
        detail: `Setup email resent by ${actor.name} (${actor.role})`,
      });

      return { ok: true, emailSent: true };
    });
  });
}
