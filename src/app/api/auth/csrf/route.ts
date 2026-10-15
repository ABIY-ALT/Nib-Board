import { NextResponse } from 'next/server';
import { currentCsrfToken } from '@/lib/csrf.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The anti-CSRF token for this browser's current cookies.
 *
 * The page calls this when it has no token yet, or when the API refused the
 * one it had because the cookies changed underneath it (a sign-in or sign-out
 * in another tab, say). Only a same-origin page can read the response, which
 * is what makes the token something a forged request cannot carry.
 */
export async function GET() {
  return NextResponse.json({ csrfToken: await currentCsrfToken() });
}
