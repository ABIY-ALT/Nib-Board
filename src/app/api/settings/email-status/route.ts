import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handle } from '@/lib/handler';
import { getEmailConfigSummary } from '@/lib/email';
import { assertPermission } from '@/lib/permissions.server';
import { PERMISSIONS } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Returns the current SMTP configuration summary for administrators.
 * Sensitive values like passwords are never returned.
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await assertPermission(
      user,
      PERMISSIONS.CONFIGURE_SETTINGS,
      'Access Denied: your role does not hold the "Governance Settings & Classifications" permission.'
    );

    return getEmailConfigSummary();
  });
}
