import { hash, verify } from '@node-rs/argon2';
import {
  checkPasswordPolicy,
  BREACHED_PASSWORD_PROBLEM,
  type PasswordPolicyResult,
} from './password-policy';
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
 * The full check for a password about to be set, for the API: the shared rules
 * the browser also applies, then the breach lookup it cannot — the list of the
 * most-breached passwords and, when configured, the Pwned Passwords corpus
 * (breached-passwords.server.ts). The lookup runs only once the shared rules
 * pass, so a password already refused for another reason costs no request to
 * the range service.
 */
export async function checkNewPassword(
  plain: string,
  context: { name?: string; email?: string } = {}
): Promise<PasswordPolicyResult> {
  const result = checkPasswordPolicy(plain, context);
  if (result.ok && (await isKnownCompromised(plain))) {
    return { ok: false, problems: [BREACHED_PASSWORD_PROBLEM] };
  }
  return result;
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
