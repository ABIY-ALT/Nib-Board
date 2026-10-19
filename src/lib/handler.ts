import { NextResponse } from 'next/server';
import { HttpError } from './auth';
import { isValidPhone, normalizePhone, PHONE_REQUIREMENT } from './users';

/**
 * Wraps a route handler so that authorization failures surface as the right
 * status rather than a 500. Handlers throw HttpError (401/403/404/409/400) and
 * this converts it; anything else is logged server-side and reported as a
 * generic 500, so internal detail never reaches the client.
 */
export async function handle<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    const result = await fn();
    // A handler that builds its own response — a file download, say — has
    // already decided its status and headers, and JSON-encoding it would
    // destroy both. Everything else is serialized as JSON exactly as before.
    if (result instanceof Response) return result;
    return NextResponse.json(result ?? { ok: true });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json(
        err.code ? { error: err.message, code: err.code } : { error: err.message },
        { status: err.status }
      );
    }
    console.error('[api] unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Parses a JSON object body, treating anything else as a client error.
 *
 * Every route destructures the result, so a body that parses but is not an
 * object — `null`, an array, a bare number — is refused here: destructuring it
 * would throw a TypeError and surface as a 500. A body declared as some other
 * media type (an upload posted to a JSON endpoint, say) is refused with 415
 * before it is read.
 *
 * Insisting on application/json is also a CSRF layer (assessment finding
 * "Absence of Anti-CSRF Tokens"): an HTML form on another site can only send
 * urlencoded, multipart or text/plain, so no such form can produce a request
 * any JSON endpoint accepts. Every caller in the application sets the header.
 */
export async function readJson<T = Record<string, unknown>>(
  req: Request,
  options: { maxBytes?: number } = {}
): Promise<T> {
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
  if (contentType && !/^application\/([\w.+-]+\+)?json\b/.test(contentType)) {
    throw new HttpError(415, 'Send the request body as application/json.');
  }

  const { maxBytes } = options;
  if (maxBytes !== undefined && Number(req.headers.get('content-length')) > maxBytes) {
    throw new HttpError(413, 'The request body is too large.');
  }

  let body: unknown;
  try {
    body =
      maxBytes === undefined ? await req.json() : JSON.parse(await readCappedText(req, maxBytes));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'Invalid JSON body');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'The request body must be a JSON object.');
  }
  return body as T;
}

/**
 * The body as text, refused with 413 once it passes maxBytes. The declared
 * Content-Length is checked by the caller, but a chunked body declares none,
 * so the count is kept while reading and the rest is never buffered.
 */
async function readCappedText(req: Request, maxBytes: number): Promise<string> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, 'The request body is too large.');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export function badRequest(message: string): never {
  throw new HttpError(400, message);
}

/**
 * An optional phone field from a request body: null when absent or blank,
 * refused with 400 when it is not a string or not a valid number, and
 * otherwise returned in its stored form (normalizePhone), so a uniqueness
 * check compares like with like.
 */
export function readPhone(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') badRequest(PHONE_REQUIREMENT);
  const phone = value.trim();
  if (!phone) return null;
  if (!isValidPhone(phone)) badRequest(PHONE_REQUIREMENT);
  return normalizePhone(phone);
}

export function conflict(message: string): never {
  throw new HttpError(409, message);
}
