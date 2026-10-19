import { hash, verify } from '@node-rs/argon2';
import { BREACHED_PASSWORD_PROBLEM, type PasswordPolicyResult } from './password-policy';
import { isKnownCompromised } from './breached-passwords.server';

/**
 * Argon2id parameters.
 *
 * Argon2id is the memory-hard variant recommended by OWASP: it resists both GPU
 * cracking and side-channel attack. 19 MiB with two passes is the OWASP minimum
 * configuration and costs roughly 40ms per verification here, which is fast
 * enough for interactive sign-in while making offline guessing expensive.
 */
const ARGON2_OPTIONS = {
  // 2 is Argon2id. The library exports this as an ambient const enum, which
  // isolatedModules forbids importing, so the value is written out directly.
  algorithm: 2,
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

/**
 * Checks a password against a stored hash. Never throws on a malformed or
 * absent hash — a corrupt record must read as "wrong password", not as a
 * server error that distinguishes it from a valid account.
 */
export async function verifyPassword(plain: string, storedHash: string | null): Promise<boolean> {
  if (!storedHash) return false;
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

/**
 * The largest JSON body read by a route that takes a password (security
 * assessment VA-005). Two passwords at MAX_PASSWORD_INPUT_LENGTH, every
 * character at its worst-case JSON escape (\uXXXX, six bytes), plus an email
 * address or setup token, fit with room to spare. The 26 MB ceiling in
 * proxy.ts is for document uploads and has no business applying here.
 */
export const MAX_PASSWORD_REQUEST_BYTES = 16 * 1024;

/**
 * The breach lookup the browser cannot run: the list of the most-breached
 * passwords and, when configured, the Pwned Passwords corpus
 * (breached-passwords.server.ts). It is the one check that may leave the
 * server, so a route setting a password runs it last (security assessment
 * VA-006): after the shared rules in checkPasswordPolicy pass, after the caller
 * has proved who they are, and after assertPasswordChangeRateLimit.
 */
export async function checkNotCompromised(plain: string): Promise<PasswordPolicyResult> {
  return (await isKnownCompromised(plain))
    ? { ok: false, problems: [BREACHED_PASSWORD_PROBLEM] }
    : { ok: true, problems: [] };
}

/**
 * The policy itself lives in `password-policy.ts` so the browser can import it
 * without dragging the native Argon2 binding into the client bundle. Re-exported
 * here so server code has one obvious place to reach for password concerns.
 */
export {
  checkPasswordPolicy,
  passwordRules,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_INPUT_LENGTH,
  type PasswordPolicyResult,
  type PasswordRule,
} from './password-policy';
