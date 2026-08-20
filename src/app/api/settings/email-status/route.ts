import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { assertRole } from '@/lib/authz';
import { handle } from '@/lib/handler';
import { getEmailConfigSummary } from '@/lib/email';
import { USER_ADMIN_ROLES } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Returns the current SMTP configuration summary for administrators.
 * Sensitive values like passwords are never returned.
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    assertRole(
      user,
      USER_ADMIN_ROLES,
      'Only an administrator or Board Secretariat may view email configuration.'
    );

    return getEmailConfigSummary();
  });
}
