import { cookies } from 'next/headers';
import { resolveSession, SESSION_COOKIE } from './session';
import { User } from './types';

export { SESSION_COOKIE };

/** Thrown by handlers; mapped to an HTTP status by `handle()`. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Principal {
  user: User;
  mustChangePassword: boolean;
}

/**
 * Resolves the caller from the session cookie, validating it against the
 * sessions table on every request.
 *
 * There is deliberately no fallback principal: an absent, unknown, revoked or
 * expired session yields null and the caller is rejected with 401. An early
 * revision of this system defaulted an unidentified caller to the first user in
 * the directory — the Board Secretariat, who has bank-wide visibility — which
 * turned a missing header into full access. Never reintroduce a default here.
 */
export async function getPrincipal(): Promise<Principal | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return resolveSession(token);
}

export async function getCurrentUser(): Promise<User | null> {
  return (await getPrincipal())?.user ?? null;
}

/**
 * The authenticated caller, or 401.
 *
 * A user who must change their password is refused everything except the
 * password-change endpoint, so an administrator-issued temporary credential
 * cannot be used to work in the system.
 */
export async function requireUser(): Promise<User> {
  const principal = await getPrincipal();
  if (!principal) {
    throw new HttpError(401, 'Authentication required: no valid session.');
  }
  if (principal.mustChangePassword) {
    throw new HttpError(403, 'PASSWORD_CHANGE_REQUIRED');
  }
  return principal.user;
}

/**
 * The authenticated caller, allowed through even when a password change is
 * outstanding. Only the password-change endpoint may use this.
 */
export async function requireUserAllowingPasswordChange(): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) {
    throw new HttpError(401, 'Authentication required: no valid session.');
  }
  return principal;
}
