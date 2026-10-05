import { prisma, type Db } from './prisma';
import { HttpError } from './auth';
import { PERMISSIONS, hasPermission } from './permissions';
import { notify } from './repo';
import { canAccessMatter } from './authz';
import { sendAnnouncementEmail, sendBestEffort } from './email';
import { appOrigin, clientIp, recordAuthEvent, userAgent } from './security';
import { formatBytes } from './storage';
import {
  ANNOUNCEMENT_TYPE_LABEL,
  type Announcement,
  type AnnouncementPriority,
  type AnnouncementStatus,
  type AnnouncementType,
} from './announcements';
import type { User } from './types';
import type { Prisma } from '@/generated/prisma/client';

/**
 * The server half of the announcement feature: who an announcement reaches, who
 * is allowed to see it, and how a row becomes the shape the browser reads.
 *
 * The audience rule lives here once, exactly as the matter visibility rule
 * lives once in `authz.ts`, and for the same reason. Listing, fetching, the
 * dashboard panel and the notification fan-out all compose this predicate
 * rather than re-deriving it, so an announcement cannot be listed to someone the
 * fan-out would not have notified, or opened by id after being filtered out of
 * a list.
 */

// ------------------------------------------------------------------ reading

const ANNOUNCEMENT_INCLUDE = {
  createdBy: { select: { name: true, title: true } },
  publishedBy: { select: { name: true } },
  cancelledBy: { select: { name: true } },
  relatedMatter: { select: { title: true } },
} satisfies Prisma.AnnouncementInclude;

export type AnnouncementRow = Prisma.AnnouncementGetPayload<{
  include: typeof ANNOUNCEMENT_INCLUDE;
}>;

export { ANNOUNCEMENT_INCLUDE };

const toIsoDate = (v: Date | null): string => (v === null ? '' : v.toISOString().slice(0, 10));
const toIsoStamp = (v: Date | null): string => (v === null ? '' : v.toISOString());

/** 'YYYY-MM-DD' for the server's current day. Meeting dates are calendar dates. */
function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export interface AudienceMember {
  id: string;
  name: string;
  role: string;
  department: string | null;
  businessArea: string;
  email: string;
}

/**
 * Everyone an announcement could reach: active officers whose role carries
 * ANNOUNCEMENT_VIEW.
 *
 * A role without the permission is not a valid audience even when it is named
 * on the announcement — a notice addressed to "all roles" must not push a
 * notification at someone the feature is switched off for. Resolved from the
 * role definitions rather than a hard-coded list, so granting the permission in
 * Governance Settings is all it takes to bring a role into scope.
 */
export async function announcementAudiencePool(db: Db = prisma): Promise<AudienceMember[]> {
  const [definitions, users] = await Promise.all([
    db.roleDefinition.findMany({ select: { roleKey: true, permissions: true } }),
    db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true, department: true, businessArea: true, email: true },
    }),
  ]);

  const permitted = new Set(
    definitions
      .filter((d) => hasPermission(d.permissions, PERMISSIONS.ANNOUNCEMENT_VIEW))
      .map((d) => d.roleKey)
  );

  return users.filter((u) => permitted.has(u.role));
}

type TargetingFields = Pick<
  AnnouncementRow,
  'targetAll' | 'targetUserIds' | 'targetRoles' | 'targetDepartments' | 'targetBusinessAreas'
>;

/** Is this person inside the announcement's stated audience? */
export function inAudience(a: TargetingFields, u: AudienceMember | User): boolean {
  if (a.targetAll) return true;
  if (a.targetUserIds.includes(u.id)) return true;
  if (a.targetRoles.includes(u.role)) return true;
  if (u.department && a.targetDepartments.includes(u.department)) return true;
  if (a.targetBusinessAreas.includes(u.businessArea)) return true;
  return false;
}

/**
 * The audience as a Prisma predicate.
 *
 * Compose it with `AND` rather than spreading it, so a caller cannot overwrite
 * one of its keys and accidentally widen the audience.
 */
export function audienceWhere(user: User): Prisma.AnnouncementWhereInput {
  const clauses: Prisma.AnnouncementWhereInput[] = [
    { targetAll: true },
    { targetUserIds: { has: user.id } },
    { targetRoles: { has: user.role } },
    { targetBusinessAreas: { has: user.businessArea } },
  ];
  if (user.department) clauses.push({ targetDepartments: { has: user.department } });
  return { OR: clauses };
}

/**
 * Announcements that have actually gone out and have not lapsed.
 *
 * A draft is not an announcement yet, a cancelled one has been withdrawn, and
 * one scheduled for next Monday has not been said. None of them belong in a
 * recipient's feed, whatever their audience says.
 */
export function liveWhere(now: Date = new Date()): Prisma.AnnouncementWhereInput {
  return {
    status: 'PUBLISHED',
    AND: [
      { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    ],
  };
}

/** What a recipient may see: live announcements addressed to them. */
export function feedWhere(user: User, now: Date = new Date()): Prisma.AnnouncementWhereInput {
  return { AND: [liveWhere(now), audienceWhere(user)] };
}

/** A one-line rendering of the audience, used in the UI and the audit record. */
export function describeAudience(a: TargetingFields, recipientCount: number): string {
  if (a.targetAll) return `All authorized users (${recipientCount})`;

  const parts: string[] = [];
  if (a.targetRoles.length) parts.push(`${a.targetRoles.length} role(s)`);
  if (a.targetDepartments.length) parts.push(`${a.targetDepartments.length} department(s)`);
  if (a.targetBusinessAreas.length) parts.push(`${a.targetBusinessAreas.length} business area(s)`);
  if (a.targetUserIds.length) parts.push(`${a.targetUserIds.length} named officer(s)`);

  if (parts.length === 0) return 'No audience selected';
  return `${parts.join(', ')} — ${recipientCount} recipient(s)`;
}

export interface MapContext {
  /** Who is reading. Determines `isRead` and whether management fields appear. */
  readerId: string;
  /** Announcement ids this reader has already opened. */
  readIds: ReadonlySet<string>;
  /** Everyone the feature could reach, for resolving recipient counts. */
  pool: AudienceMember[];
  /** Read totals per announcement, only supplied to readers who may manage. */
  readCounts?: ReadonlyMap<string, number>;
}

export function toAnnouncement(r: AnnouncementRow, ctx: MapContext): Announcement {
  const now = Date.now();
  const publishAt = r.publishAt ?? r.publishedAt;
  const started = !publishAt || publishAt.getTime() <= now;
  const expired = Boolean(r.expiresAt && r.expiresAt.getTime() <= now);
  const recipientCount = ctx.pool.filter((u) => inAudience(r, u)).length;

  const meetingDate = toIsoDate(r.meetingDate);
  const isMeeting = r.type === 'MEETING' && Boolean(meetingDate);
  const day = todayIso();

  return {
    id: r.id,
    title: r.title,
    message: r.message,
    type: r.type as AnnouncementType,
    priority: r.priority as AnnouncementPriority,
    status: r.status as AnnouncementStatus,

    publishAt: toIsoStamp(publishAt),
    expiresAt: toIsoStamp(r.expiresAt),
    isLive: r.status === 'PUBLISHED' && started && !expired,
    isExpired: r.status === 'PUBLISHED' && expired,

    audience: {
      all: r.targetAll,
      userIds: r.targetUserIds,
      roles: r.targetRoles,
      departments: r.targetDepartments,
      businessAreas: r.targetBusinessAreas,
    },
    audienceSummary: describeAudience(r, recipientCount),
    recipientCount,

    meeting:
      r.type === 'MEETING'
        ? {
            date: meetingDate,
            time: r.meetingTime ?? '',
            location: r.location ?? '',
            link: r.meetingLink ?? '',
            agenda: r.agenda ?? '',
            participants: r.participants,
          }
        : undefined,
    isMeetingToday: isMeeting && meetingDate === day,
    isUpcomingMeeting: isMeeting && meetingDate > day,

    relatedMatterId: r.relatedMatterId ?? undefined,
    relatedMatterTitle: r.relatedMatter?.title ?? undefined,
    reference: r.reference ?? undefined,

    attachment:
      r.attachmentKey && r.attachmentSha && r.attachmentName
        ? {
            name: r.attachmentName,
            fileType: r.attachmentType ?? 'application/octet-stream',
            byteSize: r.attachmentSize ?? 0,
            sha256: r.attachmentSha,
          }
        : undefined,

    createdById: r.createdById,
    createdByName: r.createdBy.name,
    createdByTitle: r.createdBy.title,
    createdAt: toIsoStamp(r.createdAt),
    updatedAt: toIsoStamp(r.updatedAt),
    publishedByName: r.publishedBy?.name ?? undefined,
    publishedAt: r.publishedAt ? toIsoStamp(r.publishedAt) : undefined,
    cancelledByName: r.cancelledBy?.name ?? undefined,
    cancelledAt: r.cancelledAt ? toIsoStamp(r.cancelledAt) : undefined,

    isRead: ctx.readIds.has(r.id),
    readCount: ctx.readCounts?.get(r.id),
  };
}

/**
 * Maps a batch of rows, gathering the per-reader and per-announcement extras in
 * two queries rather than two per row.
 */
export async function toAnnouncements(
  rows: AnnouncementRow[],
  reader: User,
  options: { includeReadCounts?: boolean } = {},
  db: Db = prisma
): Promise<Announcement[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [pool, reads, readTotals] = await Promise.all([
    announcementAudiencePool(db),
    db.announcementRead.findMany({
      where: { userId: reader.id, announcementId: { in: ids } },
      select: { announcementId: true },
    }),
    options.includeReadCounts
      ? db.announcementRead.groupBy({
          by: ['announcementId'],
          where: { announcementId: { in: ids } },
          _count: { userId: true },
        })
      : Promise.resolve([]),
  ]);

  const ctx: MapContext = {
    readerId: reader.id,
    readIds: new Set(reads.map((r) => r.announcementId)),
    pool,
    readCounts: options.includeReadCounts
      ? new Map(readTotals.map((t) => [t.announcementId, t._count.userId]))
      : undefined,
  };

  return rows.map((r) => toAnnouncement(r, ctx));
}

// ------------------------------------------------------------------ writing

/**
 * Everyone a published announcement should notify.
 *
 * Resolved at publication time from the audience as it stands then. An officer
 * provisioned tomorrow does not retroactively receive yesterday's notice — they
 * still see it in the feed if the audience covers them, because the feed applies
 * the audience predicate live, but no notification is manufactured for them.
 */
export async function resolveRecipients(
  db: Db,
  a: TargetingFields,
  options: { excludeUserId?: string } = {}
): Promise<AudienceMember[]> {
  const pool = await announcementAudiencePool(db);
  return pool.filter((u) => u.id !== options.excludeUserId && inAudience(a, u));
}

export interface AnnouncementInput {
  title: string;
  message: string;
  type: AnnouncementType;
  priority: AnnouncementPriority;
  publishAt: Date | null;
  expiresAt: Date | null;
  targetAll: boolean;
  targetUserIds: string[];
  targetRoles: string[];
  targetDepartments: string[];
  targetBusinessAreas: string[];
  meetingDate: Date | null;
  meetingTime: string | null;
  location: string | null;
  meetingLink: string | null;
  agenda: string | null;
  participants: string[];
  relatedMatterId: string | null;
  reference: string | null;
}

const TYPES = new Set(Object.keys(ANNOUNCEMENT_TYPE_LABEL));
const PRIORITIES = new Set(['Normal', 'Important', 'Urgent']);

const trimmed = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const optional = (v: unknown): string | null => trimmed(v) || null;
const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()))] : [];

/**
 * A meeting link becomes a clickable `href` in every recipient's browser, so
 * its scheme is allow-listed to web addresses. A link with no scheme at all is
 * left alone, as it always was. Whitespace and control characters are refused
 * outright: browsers strip them from URLs, which is how "java\nscript:" slips
 * past a naive scheme check.
 */
function meetingLink(v: unknown): string | null {
  const link = optional(v);
  if (!link) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(link)?.[1]?.toLowerCase();
  if (/[\s\u0000-\u001f\u007f]/.test(link) || (scheme !== undefined && scheme !== 'http' && scheme !== 'https')) {
    throw new HttpError(400, 'The meeting link must be a web address beginning with https:// or http://.');
  }
  return link;
}

/**
 * An announcement may point at a Board matter, and its recipients are shown
 * that matter's title. The author must be able to open the matter themselves:
 * otherwise anyone allowed to draft an announcement could read the title of
 * any matter in the bank by guessing its sequential id.
 */
export async function assertRelatedMatterInScope(user: User, matterId: string | null): Promise<void> {
  if (matterId && !(await canAccessMatter(user, matterId))) {
    throw new HttpError(
      403,
      'Access Denied: an announcement can only refer to a Board matter within your organizational scope.'
    );
  }
}

/**
 * Validates and normalises a submitted announcement.
 *
 * The meeting fields are cleared for every type but MEETING rather than
 * rejected, which is what makes changing an announcement's type on the form a
 * safe operation: the database CHECK would refuse the row outright, and telling
 * an officer their agenda is invalid because they switched the type is not a
 * useful error.
 */
export function parseAnnouncementInput(body: Record<string, unknown>): AnnouncementInput {
  const title = trimmed(body.title);
  const message = trimmed(body.message);
  const type = trimmed(body.type) as AnnouncementType;
  const priority = (trimmed(body.priority) || 'Normal') as AnnouncementPriority;

  if (!title) throw new HttpError(400, 'A title is required.');
  if (!message) throw new HttpError(400, 'A message is required.');
  if (!TYPES.has(type)) throw new HttpError(400, `'${type || 'none'}' is not a valid announcement type.`);
  if (!PRIORITIES.has(priority)) throw new HttpError(400, `'${priority}' is not a valid priority.`);

  const parseStamp = (v: unknown, label: string): Date | null => {
    const raw = trimmed(v);
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw new HttpError(400, `${label} is not a valid date and time.`);
    return d;
  };

  const publishAt = parseStamp(body.publishAt, 'The publish date');
  const expiresAt = parseStamp(body.expiresAt, 'The expiry date');
  if (publishAt && expiresAt && expiresAt <= publishAt) {
    throw new HttpError(400, 'The expiry date must be after the publish date.');
  }

  const targetAll = body.targetAll === true;
  const targetUserIds = stringList(body.targetUserIds);
  const targetRoles = stringList(body.targetRoles);
  const targetDepartments = stringList(body.targetDepartments);
  const targetBusinessAreas = stringList(body.targetBusinessAreas);

  if (
    !targetAll &&
    targetUserIds.length === 0 &&
    targetRoles.length === 0 &&
    targetDepartments.length === 0 &&
    targetBusinessAreas.length === 0
  ) {
    throw new HttpError(
      400,
      'Choose who this announcement is for: specific officers, roles, departments, business areas, or everyone.'
    );
  }

  const isMeeting = type === 'MEETING';
  let meetingDate: Date | null = null;
  if (isMeeting) {
    const raw = trimmed(body.meetingDate);
    if (raw) {
      // A calendar date, pinned to UTC midnight so it cannot drift a day.
      const d = new Date(`${raw.slice(0, 10)}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) throw new HttpError(400, 'The meeting date is not a valid date.');
      meetingDate = d;
    }
  }

  return {
    title,
    message,
    type,
    priority,
    publishAt,
    expiresAt,
    targetAll,
    targetUserIds,
    targetRoles,
    targetDepartments,
    targetBusinessAreas,
    meetingDate,
    meetingTime: isMeeting ? optional(body.meetingTime) : null,
    location: isMeeting ? optional(body.location) : null,
    meetingLink: isMeeting ? meetingLink(body.meetingLink) : null,
    agenda: isMeeting ? optional(body.agenda) : null,
    participants: isMeeting ? stringList(body.participants) : [],
    relatedMatterId: optional(body.relatedMatterId),
    reference: optional(body.reference),
  };
}

/**
 * The notification body for a published announcement.
 *
 * Kept short: the popover shows two lines, and the whole announcement is one
 * click away.
 */
export function notificationText(a: {
  type: string;
  title: string;
  message: string;
  priority: string;
}): { title: string; message: string } {
  const label = ANNOUNCEMENT_TYPE_LABEL[a.type as AnnouncementType] ?? 'Announcement';
  const prefix = a.priority === 'Urgent' ? 'URGENT — ' : '';
  const summary = a.message.length > 140 ? `${a.message.slice(0, 137)}…` : a.message;
  return { title: `${prefix}${label}: ${a.title}`, message: summary };
}

/** For the audit detail line, which records what was attached as well as to whom. */
export function describeAttachment(r: {
  attachmentName: string | null;
  attachmentSize: number | null;
}): string {
  if (!r.attachmentName) return 'no attachment';
  return `attachment '${r.attachmentName}' (${formatBytes(r.attachmentSize ?? 0)})`;
}

/** Roles that may be named as an audience, resolved from the role registry. */
export async function targetableRoles(db: Db = prisma): Promise<Array<{ roleKey: string; label: string }>> {
  const definitions = await db.roleDefinition.findMany({
    select: { roleKey: true, label: true, permissions: true },
    orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
  });
  return definitions
    .filter((d) => hasPermission(d.permissions, PERMISSIONS.ANNOUNCEMENT_VIEW))
    .map((d) => ({ roleKey: d.roleKey, label: d.label }));
}


// ------------------------------------------------------------- publication

/**
 * Releases an announcement to its audience.
 *
 * Publication is the moment an announcement becomes a thing that happened: the
 * status changes, the audience is resolved as it stands right now, and one
 * notification per recipient is raised — all inside the caller's transaction,
 * so an announcement can never end up marked published with half its
 * notifications written.
 *
 * Email is not sent from here. The recipients are handed back so the caller can
 * send after the transaction commits: holding a database transaction open
 * across a dozen SMTP round trips is how a slow relay turns into lock
 * contention on the whole table.
 */
export async function publishAnnouncement(
  db: Db,
  row: AnnouncementRow,
  actor: User,
  now: Date = new Date()
): Promise<{ recipients: AudienceMember[]; publishAt: Date }> {
  const recipients = await resolveRecipients(db, row);
  if (recipients.length === 0) {
    throw new HttpError(
      400,
      'This announcement has no recipients: nobody in the selected audience holds permission to view announcements.'
    );
  }

  // An expiry that has already passed would hide the announcement the instant
  // it went out — and the database refuses the row outright once publishAt
  // moves past it, which would surface as an unexplained 500. Refuse it here
  // with something the author can act on.
  if (row.expiresAt && row.expiresAt <= now) {
    throw new HttpError(
      400,
      'This announcement expired before it was published. Clear or extend the expiry date first.'
    );
  }

  // A publication scheduled for the future is still published — it simply does
  // not appear to its audience until its time, because the feed applies the
  // window. No notification is raised for it now: one that opens nothing is
  // worse than none. There is no scheduler in this application to raise it
  // later either, so a scheduled announcement arrives in the feed silently.
  const publishAt = row.publishAt && row.publishAt > now ? row.publishAt : now;

  // Conditional on still being a draft, so of two concurrent publish requests
  // exactly one wins: the other blocks on the row, then matches nothing once
  // the winner commits. The status check the caller made before opening the
  // transaction cannot do that, and every loser used to raise its own round
  // of notifications and emails.
  const { count } = await db.announcement.updateMany({
    where: { id: row.id, status: 'DRAFT' },
    data: {
      status: 'PUBLISHED',
      publishAt,
      publishedAt: now,
      publishedById: actor.id,
      updatedAt: now,
    },
  });
  if (count === 0) {
    throw new HttpError(409, 'This announcement has already been published or withdrawn.');
  }

  if (publishAt <= now) {
    const text = notificationText(row);
    await notify(
      db,
      recipients.map((r) => r.id),
      {
        announcementId: row.id,
        title: text.title,
        message: text.message,
        type: 'ANNOUNCEMENT',
        priority: row.priority as AnnouncementPriority,
      }
    );
  }

  return { recipients, publishAt };
}

/**
 * Records that this reader opened the announcement.
 *
 * The receipt is written once and the audit event derived from it, so opening
 * the same notice every morning does not fill the security log with a row a
 * day. Returns whether this was the first time, which is what the caller
 * audits on.
 */
export async function recordRead(db: Db, announcementId: string, userId: string): Promise<boolean> {
  const existing = await db.announcementRead.findUnique({
    where: { announcementId_userId: { announcementId, userId } },
    select: { readAt: true },
  });
  if (existing) return false;

  await db.announcementRead.create({ data: { announcementId, userId } });
  return true;
}

// -------------------------------------------------------- audit & dispatch

/**
 * Appends an announcement event to the institution-wide administrative record,
 * naming the audience it reached.
 *
 * An announcement has no Board matter, and `audit_logs` is anchored to one, so
 * `auth_events` is the existing audit table that can hold it. It is append-only
 * by trigger like the other, and it is what the Governance Audit Log screen
 * already reads — so announcement history shows up beside role changes and
 * account provisioning without a new screen or a new table.
 */
export async function auditAnnouncement(
  req: Request,
  actor: User,
  row: AnnouncementRow,
  event:
    | 'ANNOUNCEMENT_CREATED'
    | 'ANNOUNCEMENT_UPDATED'
    | 'ANNOUNCEMENT_PUBLISHED'
    | 'ANNOUNCEMENT_CANCELLED'
    | 'ANNOUNCEMENT_DELETED'
    | 'ANNOUNCEMENT_VIEWED',
  extra: { recipientCount?: number; note?: string } = {}
): Promise<void> {
  const audience = row.targetAll
    ? 'all authorized users'
    : [
        row.targetRoles.length ? `roles [${row.targetRoles.join(', ')}]` : '',
        row.targetDepartments.length ? `departments [${row.targetDepartments.join(', ')}]` : '',
        row.targetBusinessAreas.length
          ? `business areas [${row.targetBusinessAreas.join(', ')}]`
          : '',
        row.targetUserIds.length ? `${row.targetUserIds.length} named officer(s)` : '',
      ]
        .filter(Boolean)
        .join('; ');

  const label = ANNOUNCEMENT_TYPE_LABEL[row.type as AnnouncementType] ?? row.type;
  const recipients =
    typeof extra.recipientCount === 'number' ? ` — ${extra.recipientCount} recipient(s)` : '';

  await recordAuthEvent(prisma, {
    event,
    userId: actor.id,
    ip: clientIp(req),
    userAgent: userAgent(req),
    detail:
      `${label} '${row.title}' (${row.id}), priority ${row.priority}, ${describeAttachment(row)}. ` +
      `Audience: ${audience || 'none'}${recipients}.` +
      (extra.note ? ` ${extra.note}` : ''),
  });
}

/**
 * Emails a published announcement to its recipients, after the record has been
 * committed.
 *
 * Best effort by design: the announcement is already published and every
 * recipient already has it in the application. A relay that is down must not
 * turn a completed publication into an error the officer will try to repeat.
 * Returns how many messages actually went out, which the caller reports back.
 */
export async function dispatchAnnouncementEmails(
  req: Request,
  sender: User,
  row: AnnouncementRow,
  recipients: AudienceMember[]
): Promise<number> {
  if (recipients.length === 0) return 0;
  const origin = appOrigin(req);
  const label = ANNOUNCEMENT_TYPE_LABEL[row.type as AnnouncementType] ?? 'Announcement';

  const results: boolean[] = [];
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    const ok = await sendBestEffort(() =>
      sendAnnouncementEmail(
        r.email,
        r.name,
        {
          title: row.title,
          message: row.message,
          typeLabel: label,
          priority: row.priority,
          senderName: sender.name,
          senderTitle: sender.title,
          meeting:
            row.type === 'MEETING'
              ? {
                  date: row.meetingDate ? row.meetingDate.toISOString().slice(0, 10) : '',
                  time: row.meetingTime ?? '',
                  location: row.location ?? '',
                  link: row.meetingLink ?? '',
                  agenda: row.agenda ?? '',
                }
              : undefined,
        },
        origin
      )
    );
    results.push(ok);

    // Throttle slightly between sends to respect SMTP submission rate limits (e.g. Exchange / Office 365)
    if (i < recipients.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  return results.filter(Boolean).length;
}
