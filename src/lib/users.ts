import { Role } from './types';

// Imported by client components (UserFormModal), so nothing here may pull in a
// Node module: importing 'crypto' bundled a browser polyfill whose ASN.1
// parser calls eval() on load, which the CSP blocks.

/** Roles an administrator may assign. Mirrors the CHECK constraint on users.role. */
export const ASSIGNABLE_ROLES: Role[] = [
  'BOARD_SECRETARIAT',
  'BOARD_MEMBER',
  'CEO',
  'CEO_SECRETARIAT',
  'CHIEF',
  'DEPUTY_CHIEF',
  'DIRECTOR',
  'ADMIN',
];

export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * An Ethiopian telephone number, mobile or fixed line: "+251" or a leading
 * "0", then the nine-digit national number — 9… or 7… for a mobile, an area
 * code such as 11 (Addis Ababa) for a fixed line. Spaces, hyphens, dots and
 * brackets are separators and ignored, so "+251 11 550 3288" and "0911234567"
 * both pass, while "091110" (too short) and "091234533333333333" (too long)
 * do not.
 *
 * Shared by the user routes and the user form, so the browser's message and
 * the server's refusal are the same rule. The server is the one that counts.
 */
const PHONE_PATTERN = /^(?:\+251|0)[1-9]\d{8}$/;

/** Longest a number can be with generous spacing; longer is not a phone number. */
const MAX_PHONE_INPUT_LENGTH = 24;

export const PHONE_REQUIREMENT =
  'Enter a valid Ethiopian phone number: 0 or +251 followed by 9 digits, e.g. 0911 234 567 or +251 11 550 3288.';

export function isValidPhone(phone: string): boolean {
  return phone.length <= MAX_PHONE_INPUT_LENGTH && PHONE_PATTERN.test(phone.replace(/[\s\-.()]/g, ''));
}
