import type { BODMatter, MatterEscalation, Role } from './types';

/**
 * Escalation rules shared by the browser and the server.
 *
 * The server applies every one of these for itself; the browser uses them only
 * to decide what to offer, so an officer is not invited to do something the
 * API will refuse.
 */

/**
 * Who a matter can be escalated to. Escalation goes up to someone with the
 * authority to unblock the matter, never sideways or down, so the target list
 * is the executive and oversight roles rather than anyone in the directory.
 */
export const ESCALATION_TARGET_ROLES: readonly Role[] = ['CEO', 'CHIEF', 'BOARD_SECRETARIAT'];

/** A reason has to say something. A word or two is not a reason. */
export const ESCALATION_REASON_MIN = 15;
export const ESCALATION_REASON_MAX = 2000;
export const ESCALATION_NOTE_MAX = 2000;

/** The escalation currently open on a matter, if there is one. */
export const openEscalation = (m: BODMatter): MatterEscalation | undefined =>
  m.escalations.find((e) => e.status === 'OPEN');

export const isEscalated = (m: BODMatter): boolean => openEscalation(m) !== undefined;

/** Whole days an escalation has been open. */
export const daysEscalated = (e: MatterEscalation): number =>
  Math.max(0, Math.floor((Date.now() - new Date(e.escalatedAt).getTime()) / 86_400_000));

/** "today", "1 day", "12 days" — how long an escalation has been open. */
export const escalationAge = (e: MatterEscalation): string => {
  const d = daysEscalated(e);
  return d === 0 ? 'today' : d === 1 ? '1 day' : `${d} days`;
};
