import { requireUser } from '@/lib/auth';
import { assertRole } from '@/lib/authz';
import { handle, readJson, badRequest } from '@/lib/handler';
import { sendTestEmail } from '@/lib/email';
import { EMAIL_PATTERN, USER_ADMIN_ROLES } from '@/lib/users';
import { assertSameOrigin } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sends a test email to verify SMTP configuration and live delivery.
 */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    assertRole(
      user,
      USER_ADMIN_ROLES,
      'Only an administrator or Board Secretariat may run SMTP diagnostics.'
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
