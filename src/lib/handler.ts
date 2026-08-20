import { NextResponse } from 'next/server';
import { HttpError } from './auth';

/**
 * Wraps a route handler so that authorization failures surface as the right
 * status rather than a 500. Handlers throw HttpError (401/403/404/409/400) and
 * this converts it; anything else is logged server-side and reported as a
 * generic 500, so internal detail never reaches the client.
 */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const result = await fn();
    return NextResponse.json(result ?? { ok: true });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[api] unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Parses a JSON body, treating a malformed one as a client error. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

export function badRequest(message: string): never {
  throw new HttpError(400, message);
}

export function conflict(message: string): never {
  throw new HttpError(409, message);
}
