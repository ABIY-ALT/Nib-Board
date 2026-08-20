/**
 * The password policy, in one place.
 *
 * This module is deliberately free of server-only dependencies — `lib/password.ts`
 * pulls in the native Argon2 binding, which cannot be bundled for the browser —
 * so the sign-in UI and the API can enforce exactly the same rule. The API is
 * still the authority; the UI imports this only so an officer sees the rule
 * before submitting rather than after being rejected.
 */

/**
 * Six characters is the floor.
 *
 * The composition requirements (upper, lower, digit, symbol) that this policy
 * used to carry were dropped: at this length they push people towards
 * "Passw0rd!" without buying real strength, and an officer replacing a
 * temporary credential has to be able to satisfy the rule. The online-guessing
 * defences in lib/security.ts carry the weight instead — five failures lock the
 * account for fifteen minutes, and the per-address rate limiter stops one
 * source spraying the whole staff directory.
 */
export const MIN_PASSWORD_LENGTH = 6;

export interface PasswordPolicyResult {
  ok: boolean;
  problems: string[];
}

export interface PasswordRule {
  /** Shown to the user as a checklist item, phrased positively. */
  label: string;
  /** Appended to "The new password …" in the API's rejection message. */
  problem: string;
  test: (plain: string) => boolean;
}

/**
 * The rules, bound to the account they are being applied to.
 *
 * What survives the relaxed length rule are the two checks that catch a
 * genuinely guessable credential: a password built out of the account's own
 * name or email address — the first thing anyone holding the staff directory
 * would try — and a single character repeated.
 */
export function passwordRules(context: { name?: string; email?: string } = {}): PasswordRule[] {
  // Both sides are reduced to letters and digits first, so "Rahel Solomon"
  // still matches "RahelSolomon12" and "rahel.solomon" matches "Rahel_Solomon".
  // Each name part is checked on its own, not just the full string.
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

  const identifiers = [
    ...(context.name?.split(/\s+/) ?? []),
    ...(context.email?.split('@')[0]?.split(/[._-]/) ?? []),
  ]
    .map(normalise)
    .filter((token) => token.length >= 4);

  return [
    {
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      problem: `must be at least ${MIN_PASSWORD_LENGTH} characters`,
      test: (plain) => plain.length >= MIN_PASSWORD_LENGTH,
    },
    {
      label: 'Does not contain your name or email address',
      problem: 'must not contain your name or email address',
      test: (plain) => {
        const normalised = normalise(plain);
        return !identifiers.some((token) => normalised.includes(token));
      },
    },
    {
      label: 'Not the same character repeated',
      problem: 'must not be a single repeated character',
      test: (plain) => plain.length === 0 || new Set(plain).size > 1,
    },
  ];
}

export function checkPasswordPolicy(
  plain: string,
  context: { name?: string; email?: string } = {}
): PasswordPolicyResult {
  const problems = passwordRules(context)
    .filter((rule) => !rule.test(plain))
    .map((rule) => rule.problem);

  return { ok: problems.length === 0, problems };
}
