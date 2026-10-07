import { requireUser } from '@/lib/auth';
import { handle, readJson, badRequest } from '@/lib/handler';
import { sendTestEmail } from '@/lib/email';
import { EMAIL_PATTERN } from '@/lib/users';
import { assertSameOrigin } from '@/lib/security';
import { assertPermission } from '@/lib/permissions.server';
import { PERMISSIONS } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sends a test email to verify SMTP configuration and live delivery.
 */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    await assertPermission(
      user,
      PERMISSIONS.CONFIGURE_SETTINGS,
      'Access Denied: your role does not hold the "Governance Settings & Classifications" permission.'
    );

    const body = await readJson<{ to?: string }>(req);
    const to = body.to?.trim();

    if (!to || !EMAIL_PATTERN.test(to)) {
      badRequest('Enter a valid recipient email address.');
    }

    await sendTestEmail(to!, user.name);

    return {
      ok: true,
      message: `Test email successfully sent to ${to}. Check the inbox.`,
    };
  });
}
