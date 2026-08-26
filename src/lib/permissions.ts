/**
 * The permission vocabulary, shared by the browser and the server.
 *
 * Access is decided as `User → Role → Permission → Feature`. A feature never
 * asks what role someone holds; it asks whether the role they hold carries the
 * permission, which is a row an administrator can edit in Governance Settings →
 * Roles & Permissions. That is the whole point: the Board Secretariat holds
 * these permissions today, but any role can be granted them, and a role can
 * have them taken away without touching a line of code.
 *
 * The keys here are the announcement and reminder permissions. The older
 * matter-workflow permissions live in `roles.ts` alongside the role defaults
 * and use lowercase keys; both vocabularies sit in the same `permissions`
 * array on a role definition, so a key must be unique across the two.
 */

export const PERMISSIONS = {
  /** See the announcements addressed to you. */
  ANNOUNCEMENT_VIEW: 'ANNOUNCEMENT_VIEW',
  /** Draft a new announcement of any type, including a meeting notice. */
  ANNOUNCEMENT_CREATE: 'ANNOUNCEMENT_CREATE',
  /** Amend an announcement — including one somebody else drafted. */
  ANNOUNCEMENT_EDIT: 'ANNOUNCEMENT_EDIT',
  /** Release an announcement to its audience, which is what raises the notifications. */
  ANNOUNCEMENT_PUBLISH: 'ANNOUNCEMENT_PUBLISH',
  /** Withdraw an announcement. */
  ANNOUNCEMENT_DELETE: 'ANNOUNCEMENT_DELETE',
  /** See the pending, overdue and approaching Board matters within your scope. */
  TASK_REMINDER_VIEW: 'TASK_REMINDER_VIEW',
  /** Send a reminder to the officer holding a matter. */
  TASK_REMINDER_SEND: 'TASK_REMINDER_SEND',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Whether a granted set carries a permission.
 *
 * Deliberately has no "administrators can do anything" branch. An escape hatch
 * of that shape is how a permission model quietly turns back into a role model:
 * the check passes for one role whatever the configuration says, and the screen
 * that appears to govern the feature no longer does. ADMIN and the Board
 * Secretariat are granted these permissions in the role definitions instead,
 * where they are visible and can be changed.
 */
export function hasPermission(
  granted: readonly string[] | null | undefined,
  key: PermissionKey
): boolean {
  return Array.isArray(granted) && granted.includes(key);
}

export function hasAnyPermission(
  granted: readonly string[] | null | undefined,
  keys: readonly PermissionKey[]
): boolean {
  return keys.some((k) => hasPermission(granted, k));
}
