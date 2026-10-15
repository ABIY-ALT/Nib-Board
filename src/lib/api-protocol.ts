/**
 * What the browser and the API agree on beyond plain JSON.
 *
 * Dependency-free on purpose: the client bundle imports it, and anything it
 * pulled in would ship to the browser too.
 */

/**
 * The header carrying the anti-CSRF token on every state-changing API request
 * (security assessment VA-003). src/proxy.ts refuses a POST, PUT, PATCH or
 * DELETE without a valid one.
 */
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Machine-readable codes carried as `code` beside `error` in an API error body,
 * for the cases the client has to act on rather than only display.
 */
export const API_ERROR = {
  /** The anti-CSRF token was missing or stale: fetch a fresh one and retry. */
  CSRF_INVALID: 'CSRF_TOKEN_INVALID',
  /** The session cookie is absent, ended or expired: the user is signed out. */
  SESSION_REQUIRED: 'SESSION_REQUIRED',
} as const;
