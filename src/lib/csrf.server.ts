import { createHmac, randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { CSRF_HEADER } from './api-protocol';
import { safeEquals, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from './session';

/**
 * Anti-CSRF tokens (security assessment VA-003).
 *
 * The token is an HMAC keyed by a secret the browser holds only in an httpOnly
 * cookie: the session token once signed in, a random pre-session value before
 * that. Page script cannot read either cookie, so it learns the token only from
 * a same-origin API response, and a page on another site can read neither. A
 * forged request therefore arrives without the header, or with a value that
 * does not match, and src/proxy.ts refuses it.
 *
 * Binding the token to the session means it changes at every sign-in and
 * password change, and needs no table: the server recomputes it from the
 * cookie on each request. The sessions table stores only a plain SHA-256 of the
 * session token, so someone reading the database cannot derive the token either.
 *
 * This adds to the other layers rather than replacing them: the SameSite=Strict
 * cookie, the Origin and Sec-Fetch-Site checks, and readJson's insistence on
 * application/json.
 */

/**
 * Before sign-in there is no session to bind to, but the sign-in and
 * password-setup forms still need a token, or another site could submit them
 * (a login CSRF that signs the victim into the attacker's account). This
 * cookie is the secret those tokens are keyed by. It authorizes nothing.
 */
export const PRESESSION_COOKIE = 'nib_presession';

/** Distinguishes these tokens from any other HMAC ever keyed by the same secret. */
const CSRF_LABEL = 'nib-board/csrf/v1';

export function csrfTokenFor(secret: string): string {
  return createHmac('sha256', secret).update(CSRF_LABEL).digest('base64url');
}

/**
 * Whether a state-changing request carries the token for the cookies it
 * presents. The session cookie, when present, is the key, so a pre-session
 * token cannot be replayed against a signed-in browser.
 */
export function hasValidCsrfToken(req: NextRequest): boolean {
  const secret =
    req.cookies.get(SESSION_COOKIE)?.value || req.cookies.get(PRESESSION_COOKIE)?.value;
  const presented = req.headers.get(CSRF_HEADER);
  if (!secret || !presented) return false;
  return safeEquals(presented, csrfTokenFor(secret));
}

/**
 * The token for a browser with no session, creating its pre-session secret if
 * it has none yet. For responses that leave the browser signed out.
 */
export async function issuePresessionCsrfToken(): Promise<string> {
  const store = await cookies();
  let secret = store.get(PRESESSION_COOKIE)?.value;
  if (!secret) {
    secret = randomBytes(32).toString('hex');
    store.set(PRESESSION_COOKIE, secret, SESSION_COOKIE_OPTIONS);
  }
  return csrfTokenFor(secret);
}

/** The token matching the cookies this request arrived with. */
export async function currentCsrfToken(): Promise<string> {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  return session ? csrfTokenFor(session) : issuePresessionCsrfToken();
}
