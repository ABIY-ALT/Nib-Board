import { requireUser, HttpError } from '@/lib/auth';
import { assertMatterAccess, filterNotifiableUsers } from '@/lib/authz';
import { handle, readJson, badRequest } from '@/lib/handler';
import { prisma, transaction } from '@/lib/prisma';
import { appendAudit, generateId, getMatter, lockMatter, notify } from '@/lib/repo';
import { assertPermission, can } from '@/lib/permissions.server';
import { PERMISSIONS } from '@/lib/permissions';
import {
  ESCALATION_NOTE_MAX,
  ESCALATION_REASON_MAX,
  ESCALATION_REASON_MIN,
  ESCALATION_TARGET_ROLES,
} from '@/lib/escalations';
import { sendBestEffort, sendEscalationEmail } from '@/lib/email';
import { appOrigin, clientIp, recordAuthEvent, userAgent } from '@/lib/security';
import type { Role } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const DAY = 86_400_000;
const startOfToday = () => new Date(new Date().toISOString().slice(0, 10)).getTime();
const toIsoDate = (v: Date) => v.toISOString().slice(0, 10);

/**
 * Escalates a Board matter to a senior officer.
 *
 * Escalation leaves ownership, status and routing exactly as they were: the
 * matter keeps moving through the hands it is in, and the officer it is
 * escalated to is asked to find out why it is stuck. What has to be true, each
 * checked here rather than assumed from the screen the caller was looking at:
 *
 *   * the caller holds `escalate_matter` and the matter is inside their scope;
 *   * the matter is still open, and not already escalated;
 *   * the target is an active CEO, Chief or Board Secretariat officer who can
 *     themselves open the matter — escalating to someone who cannot see it
 *     would notify them about a record they are refused;
 *   * the reason says something.
 */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await assertMatterAccess(user, id);
    await assertPermission(
      user,
      PERMISSIONS.ESCALATE_MATTER,
      'Access Denied: your role does not hold the "Escalate matter" permission.'
    );

    const body = await readJson<{ escalatedToId?: unknown; reason?: unknown }>(req);
    const targetId = typeof body.escalatedToId === 'string' ? body.escalatedToId : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!targetId) badRequest('Choose the officer to escalate this matter to.');
    if (reason.length < ESCALATION_REASON_MIN) {
      badRequest(`Give a reason of at least ${ESCALATION_REASON_MIN} characters.`);
    }
    if (reason.length > ESCALATION_REASON_MAX) {
      badRequest(`The reason must be at most ${ESCALATION_REASON_MAX} characters.`);
    }
    if (targetId === user.id) {
      badRequest('You cannot escalate a matter to yourself.');
    }

    const outcome = await transaction(async (tx) => {
      await lockMatter(tx, id);
      const matter = (await tx.matter.findUnique({
        where: { id },
        include: { currentOwner: { select: { name: true, title: true } } },
      }))!;

      if (matter.status === 'Closed') {
        throw new HttpError(409, 'This BOD matter is closed; there is nothing to escalate.');
      }

      const existing = await tx.matterEscalation.findFirst({
        where: { matterId: id, status: 'OPEN' },
        select: {
          escalatedAt: true,
          escalatedBy: { select: { name: true } },
          escalatedTo: { select: { name: true } },
        },
      });
      if (existing) {
        throw new HttpError(
          409,
          `This matter is already escalated to ${existing.escalatedTo.name} by ${existing.escalatedBy.name} ` +
            `(${existing.escalatedAt.toLocaleString('en-GB')}). Resolve that escalation before raising another.`
        );
      }

      const target = await tx.user.findFirst({
        where: { id: targetId, isActive: true },
        select: { id: true, name: true, title: true, role: true, email: true },
      });
      if (!target || !ESCALATION_TARGET_ROLES.includes(target.role as Role)) {
        badRequest('A matter can only be escalated to an active CEO, Chief or Board Secretariat officer.');
      }
      const [reachable] = await filterNotifiableUsers(tx, id, [target!.id]);
      if (!reachable) {
        throw new HttpError(
          409,
          `${target!.name} cannot open this matter under their organizational scope, so it cannot be escalated to them.`
        );
      }

      const now = new Date();
      await tx.matterEscalation.create({
        data: {
          id: generateId('esc'),
          matterId: id,
          escalatedById: user.id,
          escalatedToId: target!.id,
          escalatedAt: now,
          reason,
        },
      });

      // The record changed, so its timestamp moves; that is also what tells an
      // open detail screen to reload the audit trail.
      await tx.matter.update({ where: { id }, data: { updatedAt: now } });

      const targetLabel = `${target!.name}, ${target!.title}`;

      await appendAudit(tx, {
        matterId: id,
        user,
        action: 'Matter Escalated',
        comment: `Escalated to ${targetLabel}. Reason: ${reason}`,
      });

      await notify(tx, [target!.id], {
        matterId: id,
        title: `Escalated to you: ${id}`,
        message: `${user.name} (${user.title}) escalated ${matter.title} to you. Reason: ${reason}`,
        type: 'ESCALATION',
        priority: 'Urgent',
      });

      // The people accountable for the matter hear that it has gone up, so
      // nobody learns it from the CEO's office first.
      const accountable = await filterNotifiableUsers(
        tx,
        id,
        [
          matter.currentOwnerId,
          matter.responsibleChiefId,
          matter.accountableExecutiveId,
          matter.responsibleDirectorId,
        ].filter((u) => u !== user.id && u !== target!.id)
      );
      await notify(tx, accountable, {
        matterId: id,
        title: `${id} has been escalated`,
        message: `${user.name} escalated ${matter.title} to ${targetLabel}. Reason: ${reason}`,
        type: 'ESCALATION',
        priority: 'Important',
      });

      return { matter, target: target! };
    });

    await recordAuthEvent(prisma, {
      event: 'MATTER_ESCALATED',
      userId: user.id,
      ip: clientIp(req),
      userAgent: userAgent(req),
      detail:
        `Escalated ${id} (${outcome.matter.resolutionNumber}) to ` +
        `${outcome.target.name} <${outcome.target.email}> — ${reason}`,
    });

    // Mail last, and best effort: the escalation is recorded and already in the
    // target's notifications whether or not it goes out.
    const daysRemaining = Math.ceil((outcome.matter.deadline.getTime() - startOfToday()) / DAY);
    await sendBestEffort(() =>
      sendEscalationEmail(
        outcome.target.email,
        outcome.target.name,
        {
          matterId: id,
          resolutionNumber: outcome.matter.resolutionNumber,
          title: outcome.matter.title,
          status: outcome.matter.status,
          deadline: toIsoDate(outcome.matter.deadline),
          daysRemaining,
          isOverdue: daysRemaining < 0,
          ownerName: outcome.matter.currentOwner.name,
          ownerTitle: outcome.matter.currentOwner.title,
          escalatedByName: user.name,
          escalatedByTitle: user.title,
          reason,
        },
        appOrigin(req)
      )
    );

    return getMatter(prisma, id);
  });
}

/**
 * Resolves the open escalation on a matter, with a note on how it was dealt
 * with.
 *
 * The officer it was escalated to may always resolve it — dealing with it is
 * what they were asked to do. Anyone else needs `escalate_matter`.
 */
export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await assertMatterAccess(user, id);

    const body = await readJson<{ note?: unknown }>(req);
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (!note) badRequest('Say how the escalation was resolved.');
    if (note.length > ESCALATION_NOTE_MAX) {
      badRequest(`The resolution note must be at most ${ESCALATION_NOTE_MAX} characters.`);
    }

    const resolved = await transaction(async (tx) => {
      await lockMatter(tx, id);
      const open = await tx.matterEscalation.findFirst({
        where: { matterId: id, status: 'OPEN' },
        include: { escalatedTo: { select: { name: true } } },
      });
      if (!open) {
        throw new HttpError(409, 'This matter has no open escalation to resolve.');
      }

      if (open.escalatedToId !== user.id && !(await can(user, PERMISSIONS.ESCALATE_MATTER, tx))) {
        throw new HttpError(
          403,
          'Access Denied: only the officer this matter was escalated to, or a role holding "Escalate matter", can resolve it.'
        );
      }

      const now = new Date();
      await tx.matterEscalation.update({
        where: { id: open.id },
        data: { status: 'RESOLVED', resolvedById: user.id, resolvedAt: now, resolutionNote: note },
      });
      const matter = await tx.matter.update({ where: { id }, data: { updatedAt: now } });

      await appendAudit(tx, {
        matterId: id,
        user,
        action: 'Escalation Resolved',
        comment: `Escalation to ${open.escalatedTo.name} resolved. ${note}`,
      });

      const recipients = await filterNotifiableUsers(
        tx,
        id,
        [open.escalatedById, open.escalatedToId, matter.currentOwnerId].filter((u) => u !== user.id)
      );
      await notify(tx, recipients, {
        matterId: id,
        title: `Escalation resolved: ${id}`,
        message: `${user.name} resolved the escalation on ${matter.title}. ${note}`,
        type: 'ESCALATION',
      });

      return { matter, escalatedToName: open.escalatedTo.name };
    });

    await recordAuthEvent(prisma, {
      event: 'ESCALATION_RESOLVED',
      userId: user.id,
      ip: clientIp(req),
      userAgent: userAgent(req),
      detail:
        `Resolved escalation of ${id} (${resolved.matter.resolutionNumber}) to ` +
        `${resolved.escalatedToName} — ${note}`,
    });

    return getMatter(prisma, id);
  });
}
