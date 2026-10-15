/**
 * Known-compromised and easily guessed passwords (security assessment VA-001):
 * the part of the check that is small enough to run in the browser.
 *
 * It recognises what dominates every breach corpus: a small set of base words
 * and keyboard patterns, dressed up with capitals, look-alike symbols and
 * digits at the ends. That is how "P@ssw0rd!", "Welcome@123", "Qwerty2026" and
 * "Nib@Admin2026" all reduce to something on the list below. The API then
 * looks the password up in the breach corpus itself (breached-passwords.server.ts).
 *
 * Dependency-free on purpose: the password form imports it through
 * password-policy.ts so the officer sees the rule before submitting.
 */

/**
 * Base words. Each is matched as the whole of a password once the decoration
 * is removed, or as one of two words joined ("adminadmin", "welcomenib");
 * never as a fragment inside a longer word, so "compassion" is not "pass".
 */
const BASE_WORDS = `
password passwd passw pass pwd secret letmein welcome welcom admin administrator root toor
user guest test tester testing demo default changeme change temp temporary login logon
access master super superuser system manager iloveyou iloveu loveyou love lovely lover
loveme monkey dragon sunshine princess prince queen king football soccer baseball
basketball hockey shadow superman batman spiderman trustno michael jesus christ god
godisgood blessed angel angels freedom whatever ninja mustang flower charlie jordan hunter
ranger buster killer george andrew thomas harley robert daniel jennifer jessica ashley
nicole michelle chocolate cookie pepper ginger maggie tigger tiger lion eagle falcon
hello hellothere friend friends family money cash rich bank banker banking secure
security safe matrix starwars pokemon computer internet samsung apple google facebook
yahoo hotmail gmail microsoft windows linux oracle cisco nokia iphone android office
work business company boss cheese banana orange purple yellow silver golden gold
diamond star stars sun moon sky summer winter spring autumn fall january february march
april may june july august september october november december monday tuesday wednesday
thursday friday saturday sunday baby babygirl babyboy mother mom mommy father dad daddy
sister brother lucky happy smile sweet sweety sweetheart honey sugar cutie beautiful
pretty single forever always qwerty qwertz azerty qwertyuiop qwertyu qwer qwert asdf
asdfg asdfgh asdfghjk asdfghjkl zxcv zxcvb zxcvbn zxcvbnm qazwsx qazwsxedc qaz2wsx
1qaz2wsx zaq12wsx zaq1zaq1 zaq1xsw2 1q2w3e4r 1q2w3e4r5t 1q2w3e q1w2e3r4 q1w2e3r4t5 qwe
qwe123 123qwe 1234qwer qwer1234 asdf1234 abc abcd abcde abcdef abcdefg abcdefgh abc123
a1b2c3 aa123456 123abc abcd1234 mypass mypassword newpass newpassword oldpassword
nopassword nothing private open opensesame
nib nibbank nibinternational nibinternationalbank nibint nibboard international board
boardroom bod governance director directors secretariat secretary chairman ceo chief
officer epmo portal ethiopia ethiopian ethio addis addisababa ababa abeba abyssinia birr
habesha selam salam telebirr
`
  .trim()
  .split(/\s+/);

const WORDS = new Set(BASE_WORDS);

/** Digit strings that are not sequences or repeats but still top every breach list. */
const COMMON_NUMBERS = new Set([
  '112233', '11223344', '123123', '123321', '1234321', '147258', '147258369', '159357',
  '159753', '246810', '258456', '321321', '520520', '5201314', '696969', '741852963',
  '789456', '789456123', '852456', '963852741', '131313', '141414', '292929',
]);

/** Characters commonly typed in place of a letter. */
const LOOK_ALIKES: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't',
};

const unLookAlike = (s: string) => s.replace(/./g, (c) => LOOK_ALIKES[c] ?? c);
const alnum = (s: string) => s.replace(/[^a-z0-9]/g, '');

/**
 * Decoration is any run of digits and punctuation at either end. '@' and '$'
 * are not counted as decoration, being look-alikes for letters as often as not.
 */
const LETTERISH = /[a-z@$]/;

/** Nothing on the list is anywhere near this long; it also bounds the work. */
const MAX_CHECKED_LENGTH = 64;

/** A word on the list, or two of them joined. */
function isCommonWordCombination(core: string): boolean {
  if (WORDS.has(core)) return true;
  for (let i = 1; i < core.length; i++) {
    if (WORDS.has(core.slice(0, i)) && WORDS.has(core.slice(i))) return true;
  }
  return false;
}

/**
 * At most two runs, each a straight sequence or one repeated character, three
 * or more long: "123456", "987654", "abcdef", "abcd1234", "aaa111".
 */
function isSequential(s: string): boolean {
  let runs = 0;
  let i = 0;
  while (i < s.length) {
    let j = i + 1;
    const step = j < s.length ? s.charCodeAt(j) - s.charCodeAt(i) : 0;
    if (Math.abs(step) > 1) return false;
    while (j < s.length && s.charCodeAt(j) - s.charCodeAt(j - 1) === step) j++;
    if (j - i < 3) return false;
    runs++;
    i = j;
  }
  return runs > 0 && runs <= 2;
}

/** The same block typed over and over: "abcabc", "12341234", "passpass". */
const isRepeatedBlock = (s: string) => /^(.+?)\1+$/.test(s);

/**
 * The forms of a password worth looking up: as typed (lower-cased), with its
 * punctuation removed, and its core with the decoration stripped and
 * look-alikes read back as letters. "P@ssw0rd2026!" yields "password" among
 * others. Shared with the server's breach-list check, so both read a password
 * the same way.
 */
export function passwordVariants(plain: string): string[] {
  const lower = plain.toLowerCase();
  const variants = new Set([lower, alnum(lower)]);
  if (plain.length <= MAX_CHECKED_LENGTH) {
    // Leading decoration goes; trailing decoration is trimmed one character
    // at a time rather than all at once, because its first character may be
    // part of the word: "hell0123" is "hello" plus "123", not "hell".
    const body = lower.replace(/^[^a-z@$]+/, '');
    for (let end = body.length; end > 0 && !LETTERISH.test(body.slice(end)); end--) {
      const core = body.slice(0, end);
      variants.add(alnum(core));
      variants.add(alnum(unLookAlike(core)));
    }
  }
  variants.delete('');
  return [...variants];
}

/**
 * Whether a password is one of the commonly used ones, by the patterns above.
 * Case, look-alike symbols and decoration at the ends make no difference.
 *
 * This is the part of the check the browser can run as the officer types. The
 * API also looks the password up in a list of the most-breached passwords and,
 * when configured, in the full Pwned Passwords corpus — see
 * breached-passwords.server.ts.
 */
export function isCommonPassword(plain: string): boolean {
  if (plain.length > MAX_CHECKED_LENGTH) return false;
  const whole = alnum(plain.toLowerCase());
  if (!whole) return false;
  if (COMMON_NUMBERS.has(whole)) return true;
  return passwordVariants(plain).some(
    (v) => isCommonWordCombination(v) || isSequential(v) || isRepeatedBlock(v)
  );
}
