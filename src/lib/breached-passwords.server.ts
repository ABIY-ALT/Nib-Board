import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { passwordVariants } from './common-passwords';

/**
 * Known-compromised passwords, checked by the API whenever a password is set
 * (security assessment VA-001: "prevent the use of known-compromised
 * passwords"). Two sources, both behind the shared rules in password-policy.ts:
 *
 *  1. Always: the 100,000 passwords that occur most often in Have I Been
 *     Pwned's Pwned Passwords corpus, as published by the UK National Cyber
 *     Security Centre ("PwnedPasswordsTop100k", taken from SecLists). Held in
 *     src/lib/data/breached-passwords.txt — lower-cased, de-duplicated, and
 *     without the entries under four characters, which no password the policy
 *     accepts could match. It is checked offline, against the password as typed
 *     and its decoration-stripped core, so "Liverpool1!" is refused for being
 *     "liverpool". Pwned Passwords data: Troy Hunt, CC BY 4.0.
 *
 *  2. When PWNED_PASSWORDS_RANGE_URL is set: the whole corpus, close to a
 *     billion passwords, through its k-anonymity range API. Only the first five
 *     characters of the password's SHA-1 hash are sent, which matches about a
 *     thousand unrelated hashes; the comparison happens here, and the password
 *     itself never leaves the server. Point it at
 *     https://api.pwnedpasswords.com/range/ or at an internal mirror of it.
 */

const LIST_FILE = path.join(process.cwd(), 'src', 'lib', 'data', 'breached-passwords.txt');

/** No list entry is shorter. */
const MIN_ENTRY_LENGTH = 4;

/** A slow or unreachable range service must not hold a password change for long. */
const RANGE_TIMEOUT_MS = 4_000;

let breachList: Set<string> | null = null;

/**
 * Read once, on the first password change, and kept: about 97,000 entries.
 * A missing file is a broken deployment, and refusing the change (500) is
 * better than quietly accepting passwords the policy says it refuses.
 */
function loadBreachList(): Set<string> {
  breachList ??= new Set(fs.readFileSync(LIST_FILE, 'utf8').split('\n').filter(Boolean));
  return breachList;
}

/** Whether the password, or its core, is on the most-breached list. */
export function isOnBreachList(plain: string): boolean {
  const list = loadBreachList();
  return passwordVariants(plain).some((v) => v.length >= MIN_ENTRY_LENGTH && list.has(v));
}

/**
 * Whether the full Pwned Passwords corpus holds this exact password. Null when
 * the check is not configured, or did not answer: the offline list still
 * applies then, and an outage of the range service does not stop officers
 * changing their passwords.
 */
export async function isInPwnedPasswords(plain: string): Promise<boolean | null> {
  const base = process.env.PWNED_PASSWORDS_RANGE_URL?.trim();
  if (!base) return null;

  const hash = createHash('sha1').update(plain, 'utf8').digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const res = await fetch(`${base.replace(/\/*$/, '/')}${prefix}`, {
      // Padding makes every response a similar size, so an observer of the
      // traffic cannot infer the prefix from it either.
      headers: { 'Add-Padding': 'true', 'User-Agent': 'NIB-Board-password-check' },
      signal: AbortSignal.timeout(RANGE_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Lines are "SUFFIX:COUNT"; padding lines carry a count of 0.
    return (await res.text()).split('\n').some((line) => {
      const [candidate, count] = line.trim().split(':');
      return candidate === suffix && Number(count) > 0;
    });
  } catch (err) {
    console.error(
      '[password] Pwned Passwords range check unavailable; the offline breach list still applied:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

export async function isKnownCompromised(plain: string): Promise<boolean> {
  return isOnBreachList(plain) || (await isInPwnedPasswords(plain)) === true;
}
