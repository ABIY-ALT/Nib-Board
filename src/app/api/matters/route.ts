import { requireUser, HttpError } from '@/lib/auth';
import { assertRole, filterNotifiableUsers } from '@/lib/authz';
import { handle, readJson, badRequest } from '@/lib/handler';
import { transaction } from '@/lib/prisma';
import {
  listVisibleMatters,
  getMatter,
  getUser,
  firstUserWithRole,
  appendAudit,
  addWorkflowNode,
  notify,
} from '@/lib/repo';
import { Priority } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Matters the caller is entitled to see — never the whole table. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return listVisibleMatters(user);
  });
}

interface RegisterBody {
  resolutionNumber?: string;
  matterType?: string;
  title?: string;
  description?: string;
  boardMeetingDate?: string;
  boardDecisionDate?: string;
  effectiveDate?: string;
  priority?: string;
  deadline?: string;
  businessArea?: string;
  responsibleChiefId?: string;
  responsibleDeputyChiefId?: string;
  responsibleDirectorId?: string;
  comment?: string;
}

/**
 * A calendar date from the client, as a Date pinned to UTC midnight.
 *
 * 'YYYY-MM-DD' parses as UTC in JavaScript, which is exactly what a DATE column
 * wants: no local-time component that a later conversion could shift by a day.
 */
const toDate = (value: string | undefined | null): Date | null =>
  value ? new Date(value) : null;

/**
 * Registers a Board matter and routes it to the CEO, which is always the first
 * operational step (spec §1). Restricted to the Board Secretariat.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    assertRole(
      user,
      ['BOARD_SECRETARIAT', 'ADMIN'],
      'Only Board Secretariat is authorized to register official BOD matters.'
    );

    const body = await readJson<RegisterBody>(req);
    const required = [
      'resolutionNumber',
      'matterType',
      'title',
      'description',
      'boardDecisionDate',
      'deadline',
      'businessArea',
    ] as const;

    const missing = required.filter((f) => !body[f]);
    if (missing.length) {
      badRequest(`Missing mandatory BOD registration fields: ${missing.join(', ')}`);
    }

    return transaction(async (tx) => {
      const type = await tx.matterType.findFirst({
        where: { name: body.matterType!, isActive: true },
        select: { name: true },
      });
      if (!type) {
        throw new HttpError(400, `Unknown matter type '${body.matterType}'.`);
      }

      let director = null;
      if (body.responsibleDirectorId) {
        director = await getUser(tx, body.responsibleDirectorId);
        if (!director || director.role !== 'DIRECTOR') {
          throw new HttpError(400, 'responsibleDirectorId must reference a Director.');
        }
      }

      const chief = body.responsibleChiefId ? await getUser(tx, body.responsibleChiefId) : null;
      const deputy = body.responsibleDeputyChiefId
        ? await getUser(tx, body.responsibleDeputyChiefId)
        : null;

      const ceo = await firstUserWithRole(tx, 'CEO');
      if (!ceo) {
        throw new HttpError(500, 'No active CEO is configured to receive Board matters.');
      }

      // Sequential id per Board year, derived from what is already registered.
      const year = new Date(body.boardDecisionDate!).getFullYear();
      const prefix = `BOD-${year}-`;
      const existing = await tx.matter.findMany({
        where: { id: { startsWith: prefix } },
        select: { id: true },
      });
      const highest = existing.reduce((max, m) => {
        const n = Number.parseInt(m.id.slice(prefix.length), 10);
        return Number.isFinite(n) && n > max ? n : max;
      }, 0);
      const matterId = `${prefix}${String(highest + 1).padStart(3, '0')}`;

      await tx.matter.create({
        data: {
          id: matterId,
          resolutionNumber: body.resolutionNumber!,
          matterType: body.matterType!,
          title: body.title!,
          description: body.description!,
          boardMeetingDate: toDate(body.boardMeetingDate),
          boardDecisionDate: new Date(body.boardDecisionDate!),
          effectiveDate: toDate(body.effectiveDate),
          deadline: new Date(body.deadline!),
          priority: (body.priority as Priority) || 'Medium',
          businessArea: body.businessArea!,
          responsibleChiefId: chief?.id ?? null,
          responsibleDeputyChiefId: deputy?.id ?? null,
          responsibleDirectorId: director?.id ?? null,
          currentOwnerId: ceo.id,
          accountableExecutiveId: ceo.id,
          status: 'Under Review',
          progress: 0,
          currentStage: 'Received by CEO Office for review and assignment',
          overallStatus: 'Active - Awaiting CEO Review',
          lastAction: `${user.name} registered the Board matter and forwarded it to the CEO`,
          lastActionDate: new Date(),
          lastActionUserId: user.id,
          nextRequiredAction: 'CEO to review and assign to responsible Chief or Director',
          nextActionRole: 'CEO',
          createdBy: user.id,
        },
      });

      // The timeline starts with the Secretariat's own act of registration,
      // then the CEO as the live stage.
      await addWorkflowNode(tx, matterId, {
        level: 'BOARD_SECRETARIAT',
        label: 'Board Secretariat',
        user,
        status: 'COMPLETED',
        actedAt: new Date(),
        actionTaken: 'Registered Board Matter and forwarded to CEO',
        comment: body.comment ?? null,
      });
      await addWorkflowNode(tx, matterId, {
        level: 'CEO',
        label: 'CEO / CEO Secretariat',
        user: ceo,
        status: 'ACTIVE',
      });

      await appendAudit(tx, {
        matterId,
        user,
        action: 'Matter Created',
        newOwner: { id: ceo.id, name: ceo.name, role: ceo.role },
        newStatus: 'Under Review',
        comment: body.comment ?? `Registered ${body.matterType}: ${body.title}`,
      });

      const recipients = await filterNotifiableUsers(tx, matterId, [ceo.id]);
      await notify(tx, recipients, {
        matterId,
        title: 'New BOD Matter Received',
        message: `${user.name} registered ${matterId} (${body.matterType}) for your review.`,
        type: 'ASSIGNMENT',
      });

      return getMatter(tx, matterId);
    });
  });
}
