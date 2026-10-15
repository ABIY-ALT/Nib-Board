import { API_ERROR, CSRF_HEADER } from './api-protocol';

/**
 * Every call the browser makes to the API goes through apiFetch().
 *
 * It does two things a bare fetch() would leave to each caller:
 *
 *  - It attaches the anti-CSRF token to every state-changing request (security
 *    assessment VA-003). The server refuses such a request without one, so a
 *    call made with plain fetch() fails loudly rather than slipping through.
 *    If the token has gone stale because the cookies changed underneath this
 *    page (a sign-in or sign-out in another tab), it fetches the current one
 *    and retries, once.
 *
 *  - It notices when the server reports that the session has ended, and tells
 *    the listeners registered with onSessionEnded(), so the page can return to
 *    the sign-in screen with the reason (security assessment VA-002).
 *
 * The token is kept in memory only. It is not a credential: it is useless
 * without the httpOnly cookie it was derived from.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

let csrfToken: string | null = null;
let refreshing: Promise<void> | null = null;

/** Records the token an API response handed back after it changed the cookies. */
export function setCsrfToken(token: unknown): void {
  csrfToken = typeof token === 'string' && token ? token : null;
}

/** Fetches the token for the current cookies; concurrent callers share one request. */
function refreshCsrfToken(): Promise<void> {
  refreshing ??= fetch('/api/auth/csrf', { cache: 'no-store' })
    .then(async (res) => setCsrfToken(res.ok ? (await res.json()).csrfToken : null))
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const sessionEndedListeners = new Set<() => void>();

/** Called whenever an API response says this browser's session is over. */
export function onSessionEnded(listener: () => void): () => void {
  sessionEndedListeners.add(listener);
  return () => {
    sessionEndedListeners.delete(listener);
  };
}

/** The machine-readable `code` of an error response, if it has one. */
async function errorCode(res: Response): Promise<string | undefined> {
  if (res.ok) return undefined;
  try {
    const body = await res.clone().json();
    return typeof body?.code === 'string' ? body.code : undefined;
  } catch {
    return undefined;
  }
}

async function watchForSessionEnd(res: Response): Promise<Response> {
  if (res.status === 401 && (await errorCode(res)) === API_ERROR.SESSION_REQUIRED) {
    sessionEndedListeners.forEach((listener) => listener());
  }
  return res;
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (SAFE_METHODS.has(method)) return watchForSessionEnd(await fetch(input, init));

  const send = () => {
    const headers = new Headers(init.headers);
    if (csrfToken) headers.set(CSRF_HEADER, csrfToken);
    return fetch(input, { ...init, headers });
  };

  if (!csrfToken) await refreshCsrfToken();
  let res = await send();
  if (res.status === 403 && (await errorCode(res)) === API_ERROR.CSRF_INVALID) {
    await refreshCsrfToken();
    res = await send();
  }
  return watchForSessionEnd(res);
}
