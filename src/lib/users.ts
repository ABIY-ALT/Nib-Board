import { randomBytes } from 'crypto';
import { Role } from './types';

/**
 * Who may provision and administer accounts.
 *
 * The Board Secretariat is included because it is the office that actually
 * knows who holds which post; ADMIN is included because it is the account that
 * has to be able to recover the system when nobody else can sign in.
 */
export const USER_ADMIN_ROLES: Role[] = ['ADMIN', 'BOARD_SECRETARIAT'];

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

/**
 * A temporary credential the administrator can read out once.
 *
 * Random rather than a house pattern: it is handed over out of band, and the
 * account is flagged for a forced change the moment it is used, so it only has
 * to survive the walk down the corridor.
 */
export function generateTemporaryPassword(): string {
  return `Nib-${randomBytes(6).toString('base64url')}`;
}

export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
