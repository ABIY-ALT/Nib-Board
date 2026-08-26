/**
 * The announcement and reminder vocabulary, shared by the browser and the API.
 *
 * A meeting is a *type* of announcement here, not a separate kind of record.
 * Everything an announcement needs — targeting, priority, a publication window,
 * notifications, read receipts, audit — is the same whether it carries a board
 * resolution notice or a Tuesday agenda, so the meeting-only fields are optional
 * columns on the one model rather than a parallel one. The CHECK constraint in
 * migration 4 keeps those fields empty on every other type.
 *
 * These unions mirror the CHECK constraints on `announcements`. Adding a value
 * means editing both.
 */

import type { Priority, Role } from './types';

export type AnnouncementType =
  | 'GENERAL'
  | 'MEETING'
  | 'TASK_REMINDER'
  | 'NOTICE'
  | 'BOARD_NOTICE'
  | 'POLICY'
  | 'SYSTEM'
  | 'URGENT'
  | 'EVENT'
  | 'OTHER';

/**
 * Deliberately its own scale rather than the four-step matter `Priority`.
 * A Board matter's priority describes how pressing the *work* is; an
 * announcement's describes how loudly to say it, and three steps is all the
 * dashboard can usefully distinguish.
 */
export type AnnouncementPriority = 'Normal' | 'Important' | 'Urgent';

export type AnnouncementStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';

export const ANNOUNCEMENT_TYPES: AnnouncementType[] = [
  'GENERAL',
  'MEETING',
  'TASK_REMINDER',
  'NOTICE',
  'BOARD_NOTICE',
  'POLICY',
  'SYSTEM',
  'URGENT',
  'EVENT',
  'OTHER',
];

export const ANNOUNCEMENT_TYPE_LABEL: Record<AnnouncementType, string> = {
  GENERAL: 'General Announcement',
  MEETING: 'Meeting Announcement',
  TASK_REMINDER: 'Task / Deadline Reminder',
  NOTICE: 'Important Notice',
  BOARD_NOTICE: 'Board / Management Notice',
  POLICY: 'Policy or Procedure Update',
  SYSTEM: 'System Announcement',
  URGENT: 'Urgent Announcement',
  EVENT: 'Event Announcement',
  OTHER: 'Other',
};

export const ANNOUNCEMENT_PRIORITIES: AnnouncementPriority[] = ['Normal', 'Important', 'Urgent'];

/** Why a reminder was sent, judged from the matter at the moment of sending. */
export type ReminderReason = 'OVERDUE' | 'DUE_SOON' | 'NOT_STARTED' | 'MANUAL';

export const REMINDER_REASON_LABEL: Record<ReminderReason, string> = {
  OVERDUE: 'Past deadline',
  DUE_SOON: 'Approaching deadline',
  NOT_STARTED: 'Not yet worked on',
  MANUAL: 'Follow-up',
};

/**
 * How long a reminder counts as "already sent".
 *
 * Chasing the same officer about the same matter twice in an afternoon is how a
 * reminder feature turns into noise people learn to ignore, so the send path
 * refuses inside this window and the queue shows a reminder as already sent
 * until it lapses. A genuinely stale reminder — one from last week on a matter
 * that still has not moved — should go again, which is why this is a window and
 * not a one-shot flag.
 */
export const REMINDER_COOLDOWN_HOURS = 24;

/** Matters within this many days of their deadline count as approaching. */
export const DUE_SOON_DAYS = 7;

// ------------------------------------------------------------- client shapes

/** Who an announcement is addressed to. An empty audience reaches nobody. */
export interface AnnouncementAudience {
  /** Everyone who may see announcements at all. */
  all: boolean;
  userIds: string[];
  roles: string[];
  departments: string[];
  businessAreas: string[];
}

export interface AnnouncementAttachment {
  name: string;
  fileType: string;
  byteSize: number;
  sha256: string;
}

export interface MeetingDetails {
  date: string;
  time: string;
  location: string;
  link: string;
  agenda: string;
  participants: string[];
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: AnnouncementType;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;

  publishAt: string;
  expiresAt: string;
  /** Derived on read: published, inside its window, and not cancelled. */
  isLive: boolean;
  /** Derived on read: published but past its expiry. */
  isExpired: boolean;

  audience: AnnouncementAudience;
  /** A one-line rendering of the audience, for the list and the audit record. */
  audienceSummary: string;
  /** How many active officers the audience currently resolves to. */
  recipientCount: number;

  meeting?: MeetingDetails;
  /** Derived on read from the meeting date, in the reader's own terms. */
  isMeetingToday: boolean;
  isUpcomingMeeting: boolean;

  relatedMatterId?: string;
  relatedMatterTitle?: string;
  reference?: string;

  attachment?: AnnouncementAttachment;

  createdById: string;
  createdByName: string;
  createdByTitle: string;
  createdAt: string;
  updatedAt: string;
  publishedByName?: string;
  publishedAt?: string;
  cancelledByName?: string;
  cancelledAt?: string;

  /** Whether the reader has opened it. Always false for someone who has not. */
  isRead: boolean;
  /** Only populated for readers who may manage announcements. */
  readCount?: number;
}

/** One row of the reminder queue: a matter, its owner, and its reminder state. */
export interface TaskReminderRow {
  matterId: string;
  resolutionNumber: string;
  title: string;
  matterType: string;
  status: string;
  priority: Priority;
  businessArea: string;

  ownerId: string;
  ownerName: string;
  ownerTitle: string;
  ownerRole: Role;
  ownerEmail: string;

  /** When the matter last changed hands or was acted on. */
  assignedAt: string;
  deadline: string;
  daysRemaining: number;
  isOverdue: boolean;
  /** Calendar days the matter has sat with its current owner without action. */
  pendingDays: number;
  /** True when nothing at all has been done since it was assigned. */
  notStarted: boolean;
  reason: ReminderReason;

  lastReminderAt?: string;
  lastReminderBy?: string;
  reminderCount: number;
  /** False while the last reminder is still inside the cooldown window. */
  canRemind: boolean;
}

// ------------------------------------------------------------------ helpers

/** 'YYYY-MM-DD' for the local day, which is how meeting dates are compared. */
export function today(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isMeetingToday(a: Announcement): boolean {
  return a.type === 'MEETING' && Boolean(a.meeting?.date) && a.meeting!.date === today();
}

export function isUpcomingMeeting(a: Announcement): boolean {
  return a.type === 'MEETING' && Boolean(a.meeting?.date) && a.meeting!.date > today();
}

/** Announcements a reader should currently be shown, most pressing first. */
export const PRIORITY_RANK: Record<AnnouncementPriority, number> = {
  Urgent: 0,
  Important: 1,
  Normal: 2,
};

export function sortForFeed(items: Announcement[]): Announcement[] {
  return [...items].sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      new Date(b.publishAt || b.createdAt).getTime() -
        new Date(a.publishAt || a.createdAt).getTime()
  );
}
