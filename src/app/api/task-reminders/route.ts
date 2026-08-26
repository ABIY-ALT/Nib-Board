import { requireUser, HttpError } from '@/lib/auth';
import { assertMatterAccess, visibilityWhere } from '@/lib/authz';
import { handle, readJson, badRequest } from '@/lib/handler';
import { prisma, transaction } from '@/lib/prisma';
import { appendAudit, generateId, notify } from '@/lib/repo';
import { assertPermission } from '@/lib/permissions.server';
import { PERMISSIONS } from '@/lib/permissions';
import {
  DUE_SOON_DAYS,
  REMINDER_COOLDOWN_HOURS,
  REMINDER_REASON_LABEL,
  type ReminderReason,
  type TaskReminderRow,
} from '@/lib/announcements';
import { sendBestEffort, sendTaskReminderEmail } from '@/lib/email';
import {
  appOrigin,
  assertSameOrigin,
  clientIp,
  recordAuthEvent,
  userAgent,
} from '@/lib/security';
import type { Priority, Role } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Statuses in which nothing has yet been done about the matter. */
const NOT_STARTED_STATUSES = ['Received', 'Under Review', 'Assigned'];

const startOfToday = () => new Date(new Date().toISOString().slice(0, 10)).getTime();
const DAY = 86_400_000;

const toIsoDate = (v: Date | null) => (v === null ? '' : v.toISOString().slice(0, 10));
const toIsoStamp = (v: Date | null) => (v === null ? '' : v.toISOString());

/**
 * The task reminder queue.
 *
 * Everything here is scoped by `visibilityWhere` — the same predicate the matter
 * list and the metrics use — so holding TASK_REMINDER_VIEW never widens what
 * Board matters somebody can see. The permission decides whether they get the
 * chasing view at all; their organizational scope still decides what is in it.
 *
 * The queue is the open matters that need chasing: past their deadline,
 * approaching it, or sitting untouched with whoever they were routed to.
 * Timing is derived here rather than stored, exactly as it is for the matter
 * list, so a row cannot report yesterday's standing.
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await assertPermission(
      user,
      PERMISSIONS.TASK_REMINDER_VIEW,
      'You do not have permission to view the task reminder queue.'
    );

    const today = startOfToday();
    const dueSoonCutoff = new Date(today + DUE_SOON_DAYS * DAY);

    const rows = await prisma.matter.findMany({
      where: {
        AND: [
          visibilityWhere(user),
          { status: { not: 'Closed' } },
          {
            OR: [
              { deadline: { lte: dueSoonCutoff } },
              { status: { in: NOT_STARTED_STATUSES } },
            ],
          },
        ],
      },
      select: {
        id: true,
        resolutionNumber: true,
        title: true,
        matterType: true,
        status: true,
        priority: true,
        businessArea: true,
        deadline: true,
        progress: true,
        createdAt: true,
        lastActionDate: true,
        currentOwnerId: true,
        currentOwner: {
          select: { name: true, title: true, role: true, email: true },
        },
        // The node the matter is sitting on tells us when its present owner
        // received it, which is what "pending for" actually measures. Falling
        // back to the last action, and then to registration, keeps the figure
        // meaningful on matters registered before the workflow was recorded.
        workflowNodes: {
          where: { status: 'ACTIVE' },
          orderBy: { seq: 'desc' },
          take: 1,
          select: { assignedAt: true },
        },
      },
      orderBy: { deadline: 'asc' },
    });

    if (rows.length === 0) return [];

    // One query for the reminder history of every matter in the queue, rather
    // than one per row.
    const reminders = await prisma.taskReminder.findMany({
      where: { matterId: { in: rows.map((r) => r.id) } },
      orderBy: { sentAt: 'desc' },
      select: {
        matterId: true,
        recipientId: true,
        sentAt: true,
        sentBy: { select: { name: true } },
      },
    });

    const history = new Map<string, { last: Date; by: string; count: number }>();
    for (const r of reminders) {
      const key = `${r.matterId}:${r.recipientId}`;
      const seen = history.get(key);
      if (seen) seen.count += 1;
      else history.set(key, { last: r.sentAt, by: r.sentBy.name, count: 1 });
    }

    const cooldownStart = Date.now() - REMINDER_COOLDOWN_HOURS * 3_600_000;

    const queue: TaskReminderRow[] = rows.map((m) => {
      const daysRemaining = Math.ceil((m.deadline.getTime() - today) / DAY);
      const isOverdue = daysRemaining < 0;
      const notStarted = NOT_STARTED_STATUSES.includes(m.status) && m.progress === 0;

      const since =
        m.workflowNodes[0]?.assignedAt ?? m.lastActionDate ?? m.createdAt;
      const pendingDays = Math.max(0, Math.floor((Date.now() - since.getTime()) / DAY));

      const reason: ReminderReason = isOverdue
        ? 'OVERDUE'
        : daysRemaining <= DUE_SOON_DAYS
          ? 'DUE_SOON'
          : notStarted
            ? 'NOT_STARTED'
            : 'MANUAL';

      const seen = history.get(`${m.id}:${m.currentOwnerId}`);

      return {
        matterId: m.id,
        resolutionNumber: m.resolutionNumber,
        title: m.title,
        matterType: m.matterType,
        status: m.status,
        priority: m.priority as Priority,
        businessArea: m.businessArea,

        ownerId: m.currentOwnerId,
        ownerName: m.currentOwner.name,
        ownerTitle: m.currentOwner.title,
        ownerRole: m.currentOwner.role as Role,
        ownerEmail: m.currentOwner.email,

        assignedAt: toIsoStamp(since),
        deadline: toIsoDate(m.deadline),
        daysRemaining,
        isOverdue,
        pendingDays,
        notStarted,
        reason,

        lastReminderAt: seen ? toIsoStamp(seen.last) : undefined,
        lastReminderBy: seen?.by,
        reminderCount: seen?.count ?? 0,
        canRemind: !seen || seen.last.getTime() < cooldownStart,
      };
    });

    // Worst first: overdue before at-risk, and within each the least time left.
    return queue.sort(
      (a, b) =>
        Number(b.isOverdue) - Number(a.isOverdue) ||
        a.daysRemaining - b.daysRemaining ||
        b.pendingDays - a.pendingDays
    );
  });
}

/**
 * Sends a reminder to the officer holding a Board matter.
 *
 * Three things have to be true, and each is checked here rather than assumed
 * from the queue the caller was looking at: they hold TASK_REMINDER_SEND, the
 * matter is inside their organizational scope, and nobody has already reminded
 * the same person about the same matter inside the cooldown window.
 *
 * The last of those is the difference between a reminder feature and a nuisance.
 * A queue of thirty overdue matters is one click away from thirty duplicate
 * emails to the same director, so the refusal lives in the endpoint — not in
 * whether the button was drawn.
 */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    await assertPermission(
      user,
      PERMISSIONS.TASK_REMINDER_SEND,
      'You do not have permission to send task reminders.'
    );

    const { matterId, message } = await readJson<{ matterId?: string; message?: string }>(req);
    if (!matterId) badRequest('matterId is required');

    // The same scope check every other matter-scoped route makes, so a reminder
    // cannot be used to confirm the existence of a matter outside the caller's
    // directorate.
    await assertMatterAccess(user, matterId!);

    const note = (message ?? '').trim() || null;
    const origin = appOrigin(req);

    const outcome = await transaction(async (tx) => {
      const matter = await tx.matter.findUnique({
        where: { id: matterId! },
        select: {
          id: true,
          resolutionNumber: true,
          title: true,
          status: true,
          deadline: true,
          progress: true,
          createdAt: true,
          lastActionDate: true,
          currentOwnerId: true,
          currentOwner: { select: { name: true, title: true, email: true } },
          workflowNodes: {
            where: { status: 'ACTIVE' },
            orderBy: { seq: 'desc' },
            take: 1,
            select: { assignedAt: true },
          },
        },
      });
      if (!matter) throw new HttpError(404, 'BOD Matter not found');

      if (matter.status === 'Closed') {
        throw new HttpError(409, 'This BOD matter is closed; there is nothing to remind anyone about.');
      }
      if (matter.currentOwnerId === user.id) {
        throw new HttpError(409, 'This matter is already with you — there is nobody to remind.');
      }

      const cooldownStart = new Date(Date.now() - REMINDER_COOLDOWN_HOURS * 3_600_000);
      const recent = await tx.taskReminder.findFirst({
        where: {
          matterId: matter.id,
          recipientId: matter.currentOwnerId,
          sentAt: { gt: cooldownStart },
        },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true, sentBy: { select: { name: true } } },
      });
      if (recent) {
        const hoursLeft = Math.max(
          1,
          Math.ceil(
            (recent.sentAt.getTime() + REMINDER_COOLDOWN_HOURS * 3_600_000 - Date.now()) / 3_600_000
          )
        );
        throw new HttpError(
          409,
          `${matter.currentOwner.name} was already reminded about this matter by ${recent.sentBy.name} ` +
            `on ${recent.sentAt.toLocaleString('en-GB')}. Another reminder can be sent in ${hoursLeft} hour(s).`
        );
      }

      const today = startOfToday();
      const daysRemaining = Math.ceil((matter.deadline.getTime() - today) / DAY);
      const isOverdue = daysRemaining < 0;
      const notStarted = NOT_STARTED_STATUSES.includes(matter.status) && matter.progress === 0;
      const reason: ReminderReason = isOverdue
        ? 'OVERDUE'
        : daysRemaining <= DUE_SOON_DAYS
          ? 'DUE_SOON'
          : notStarted
            ? 'NOT_STARTED'
            : 'MANUAL';

      const since = matter.workflowNodes[0]?.assignedAt ?? matter.lastActionDate ?? matter.createdAt;
      const pendingDays = Math.max(0, Math.floor((Date.now() - since.getTime()) / DAY));

      const reminderId = generateId('rem');
      await tx.taskReminder.create({
        data: {
          id: reminderId,
          matterId: matter.id,
          recipientId: matter.currentOwnerId,
          sentById: user.id,
          reason,
          message: note,
        },
      });

      const standing = isOverdue
        ? `${Math.abs(daysRemaining)} day(s) overdue`
        : `due in ${daysRemaining} day(s)`;

      await notify(tx, [matter.currentOwnerId], {
        matterId: matter.id,
        title: `Reminder: ${matter.id} is ${standing}`,
        message:
          `${user.name} (${user.title}) sent you a reminder about ${matter.title}. ` +
          `${REMINDER_REASON_LABEL[reason]} · pending ${pendingDays} day(s).` +
          (note ? ` — ${note}` : ''),
        type: 'TASK_REMINDER',
        priority: isOverdue ? 'Urgent' : 'Important',
      });

      // A reminder is an action taken on the matter, so it joins that matter's
      // own trail beside every other action rather than living only in a
      // separate reminder log.
      await appendAudit(tx, {
        matterId: matter.id,
        user,
        action: 'Reminder Sent',
        comment:
          `Reminder sent to ${matter.currentOwner.name} (${matter.currentOwner.title}) — ` +
          `${REMINDER_REASON_LABEL[reason]}, ${standing}, pending ${pendingDays} day(s).` +
          (note ? ` Note: ${note}` : ''),
      });

      return { reminderId, matter, reason, daysRemaining, isOverdue, pendingDays };
    });

    // The institution-wide record, alongside the announcement events and the
    // rest of the administrative history.
    await recordAuthEvent(prisma, {
      event: 'TASK_REMINDER_SENT',
      userId: user.id,
      ip: clientIp(req),
      userAgent: userAgent(req),
      detail:
        `Reminder on ${outcome.matter.id} (${outcome.matter.resolutionNumber}) to ` +
        `${outcome.matter.currentOwner.name} <${outcome.matter.currentOwner.email}> — ` +
        `${REMINDER_REASON_LABEL[outcome.reason]}, pending ${outcome.pendingDays} day(s).`,
    });

    // Mail last, and best effort: the reminder is already recorded and already
    // in the recipient's notifications.
    const emailed = await sendBestEffort(() =>
      sendTaskReminderEmail(
        outcome.matter.currentOwner.email,
        outcome.matter.currentOwner.name,
        {
          matterId: outcome.matter.id,
          resolutionNumber: outcome.matter.resolutionNumber,
          title: outcome.matter.title,
          status: outcome.matter.status,
          deadline: toIsoDate(outcome.matter.deadline),
          daysRemaining: outcome.daysRemaining,
          isOverdue: outcome.isOverdue,
          pendingDays: outcome.pendingDays,
          senderName: user.name,
          senderTitle: user.title,
          message: note ?? undefined,
        },
        origin
      )
    );

    if (emailed) {
      await prisma.taskReminder.update({
        where: { id: outcome.reminderId },
        data: { emailSent: true },
      });
    }

    return {
      ok: true,
      recipient: outcome.matter.currentOwner.name,
      reason: outcome.reason,
      emailed,
    };
  });
}
