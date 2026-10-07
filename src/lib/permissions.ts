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
 * Every key the matrix offers is enforced on the server. A permission is
 * necessary but not always sufficient: matter actions still apply the workflow
 * rules on top — you can only route a matter you hold, only answer a
 * clarification addressed to you, and routing only moves down the hierarchy —
 * so granting `route_matter` lets a role route its own matters, not anyone's.
 *
 * The matter-workflow keys are lowercase for historical reasons; both sets sit
 * in the same `permissions` array on a role definition, so a key must be unique
 * across the two. Labels and descriptions for the matrix live in `roles.ts`.
 */

export const PERMISSIONS = {
  // ── Matter visibility & workflow ──────────────────────────────────────────
  /** Bank-wide visibility of every Board matter, not just your own scope. */
  SEE_ALL: 'see_all',
  /** Register a Board decision, directive or resolution. */
  REGISTER_MATTER: 'register_matter',
  /** Forward or assign a matter you hold to the level below. */
  ROUTE_MATTER: 'route_matter',
  /** Accept ownership of a matter routed to you. */
  ACCEPT_OWNERSHIP: 'accept_ownership',
  /** Ask a named officer for clarification on a matter. */
  REQUEST_CLARIFICATION: 'request_clarification',
  /** Answer a clarification addressed to you. */
  REPLY_CLARIFICATION: 'reply_clarification',
  /** Upload documents to a matter you are accountable for. */
  ATTACH_DOCUMENT: 'attach_document',
  /** Submit the Implementation Report on a matter you execute. */
  SUBMIT_REPORT: 'submit_report',
  /** Approve or send back a submitted Implementation Report. */
  CONFIRM_COMPLETION: 'confirm_completion',
  /** Formally close a confirmed matter. */
  CLOSE_MATTER: 'close_matter',
  /** Escalate a stuck matter to a senior officer, and resolve an escalation. */
  ESCALATE_MATTER: 'escalate_matter',
  /** Executive analytics, SLA and report screens. */
  VIEW_ANALYTICS: 'view_analytics',
  /** The institution-wide system audit log. */
  VIEW_AUDIT_TRAIL: 'view_audit_trail',
  // ── Administration ────────────────────────────────────────────────────────
  /** Provision, edit, reset, unlock and deactivate officer accounts. */
  ADMINISTER_USERS: 'administer_users',
  /** Roles & permissions, matter types, departments and email settings. */
  CONFIGURE_SETTINGS: 'configure_settings',
  // ── Announcements & reminders ─────────────────────────────────────────────
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
