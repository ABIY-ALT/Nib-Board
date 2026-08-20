import { NextRequest, NextResponse } from 'next/server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Returns a rejection reason for a cross-site state-changing request, or null
 * when the request is acceptable.
 *
 * Sec-Fetch-Site is set by the browser and cannot be forged by page script, so
 * it is the primary signal. Origin is checked against the serving host as a
 * fallback for browsers that omit Sec-Fetch-Site. A request with neither header
 * is not browser-initiated (curl, a service client) and is allowed through to
 * the route's own authentication.
 */
function crossSiteRejection(req: NextRequest): string | null {
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return 'Cross-site request rejected.';
  }

  const origin = req.headers.get('origin');
  if (!origin) return null;

  const allowed = new Set<string>();
  const host = req.headers.get('host');
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  for (const extra of (process.env.ALLOWED_ORIGINS ?? '').split(',')) {
    const trimmed = extra.trim();
    if (trimmed) allowed.add(trimmed);
  }

  return allowed.has(origin) ? null : 'Cross-site request rejected.';
}

/**
 * Security headers applied to every response.
 *
 * These are defence-in-depth around the server-side authorization that actually
 * protects the data: they limit what a successful injection or a hostile embed
 * could do, they do not replace the checks in the route handlers.
 *
 * Named `proxy` and living in proxy.ts: Next.js 16 renamed the `middleware`
 * file convention, and the old name now emits a deprecation warning.
 */
export function proxy(req: NextRequest) {
  const isProduction = process.env.NODE_ENV === 'production';

  // A per-request nonce lets the strict CSP admit Next.js's own hydration
  // scripts without opening the door to arbitrary inline script.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' lets the nonced Next.js loader pull in the chunks it
    // needs; development additionally needs eval for React Fast Refresh.
    isProduction
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'unsafe-eval' 'unsafe-inline'`,
    // Tailwind emits style attributes at runtime, which requires inline styles.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    // The app talks only to its own API; in development the dev server also
    // needs a websocket for Fast Refresh.
    isProduction ? `connect-src 'self'` : `connect-src 'self' ws: wss:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isProduction ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  // CSRF is enforced here rather than per-route so that adding an endpoint
  // cannot accidentally omit it. The session cookie is SameSite=Strict, which
  // already stops a browser attaching it cross-site; this is the second layer.
  if (req.nextUrl.pathname.startsWith('/api/') && !SAFE_METHODS.has(req.method)) {
    const rejection = crossSiteRejection(req);
    if (rejection) {
      return NextResponse.json({ error: rejection }, { status: 403 });
    }
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next.js reads the policy from the *request* headers to discover the nonce
  // and stamp it onto the script tags it emits. Setting it only on the response
  // leaves its own scripts un-nonced, and the strict production policy then
  // blocks them — a blank page.
  requestHeaders.set('Content-Security-Policy', csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  res.headers.set('Content-Security-Policy', csp);
  // Clickjacking: this system must never be framed, so a Board matter cannot be
  // overlaid by a hostile page to trick an executive into approving something.
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'same-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.headers.set('X-Permitted-Cross-Domain-Policies', 'none');

  if (isProduction) {
    res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  // Board data must never be held in a shared or browser cache.
  if (req.nextUrl.pathname.startsWith('/api/')) {
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.headers.set('Pragma', 'no-cache');
  }

  return res;
}

export const config = {
  matcher: [
    // Everything except Next.js's own static output, which needs no headers
    // and is served from the CDN layer in production.
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
