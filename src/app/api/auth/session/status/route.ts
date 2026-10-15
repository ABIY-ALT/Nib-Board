import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_END_MESSAGE, sessionStatus } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Is this browser's session still open, and if not, why did it end?
 *
 * The page asks this regularly and whenever it regains focus, so a browser
 * whose session was ended elsewhere (by a sign-in on another device, a
 * password change, an administrator) returns to the sign-in page with the
 * reason, instead of carrying on as if still signed in (security assessment
 * VA-002). It does not count as activity: asking keeps no idle session alive.
 */
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const status = await sessionStatus(token);
  return NextResponse.json(
    status.live
      ? { live: true }
      : { live: false, reason: status.reason, message: SESSION_END_MESSAGE[status.reason] }
  );
}
