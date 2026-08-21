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
import { Priority, MatterStatus } from '@/lib/types';

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
  initialRouteToCeo?: boolean;
  directCeoExecution?: boolean;
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
 * Registers a Board matter and routes it to either:
 * 1. The CEO for review & downstream assignment (standard workflow).
 * 2. The CEO for direct personal execution / self-ownership (strategic/executive directives).
 * 3. Directly to a designated Chief, Deputy Chief, or Director.
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
      if (!type && body.matterType) {
        // Automatically support custom/other matter types registered by Secretariat
        await tx.matterType.create({
          data: {
            name: body.matterType,
            sortOrder: 99,
            isActive: true,
          },
        }).catch(() => {});
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

      const initialRouteToCeo = body.initialRouteToCeo !== false;
      const isDirectCeoExecution = Boolean(body.directCeoExecution) || (!initialRouteToCeo && !director && !deputy && !chief);

      // Determine assigned owner:
      // If directCeoExecution: CEO directly executes.
      // If initialRouteToCeo: CEO reviews & assigns.
      // Else direct assignment: Director > Deputy Chief > Chief > CEO.
      const assignedOwner = isDirectCeoExecution
        ? ceo
        : initialRouteToCeo
        ? ceo
        : (director ?? deputy ?? chief ?? ceo);

      const accountableExecutive = chief?.id ?? deputy?.id ?? director?.id ?? ceo.id;

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

      const actionText = isDirectCeoExecution
        ? 'Registered Board Matter for direct CEO Executive Execution'
        : initialRouteToCeo
        ? 'Registered Board Matter and forwarded to CEO for review & assignment'
        : `Registered Board Matter and directly assigned to ${assignedOwner.name} (${assignedOwner.title})`;

      const currentStageText = isDirectCeoExecution
        ? 'Directly retained by CEO for Executive Execution & Implementation'
        : initialRouteToCeo
        ? 'Received by CEO Office for review and assignment'
        : `Assigned directly to ${assignedOwner.name} (${assignedOwner.title})`;

      const nextActionText = isDirectCeoExecution
        ? 'CEO to execute directive and submit Implementation Report to Board Secretariat'
        : initialRouteToCeo
        ? 'CEO to review and assign to responsible Chief or Director'
        : `${assignedOwner.name} (${assignedOwner.title}) to review and execute Board directive`;

      const initialStatus: MatterStatus = isDirectCeoExecution
        ? 'In Progress'
        : initialRouteToCeo
        ? 'Under Review'
        : 'Assigned';

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
          businessArea: body.businessArea?.trim() || 'Bank-Wide / Executive Management',
          responsibleChiefId: chief?.id ?? null,
          responsibleDeputyChiefId: deputy?.id ?? null,
          responsibleDirectorId: director?.id ?? null,
          currentOwnerId: assignedOwner.id,
          accountableExecutiveId: accountableExecutive,
          status: initialStatus,
          progress: 0,
          currentStage: currentStageText,
          overallStatus: isDirectCeoExecution
            ? 'Active - CEO Execution'
            : initialRouteToCeo
            ? 'Active - Awaiting CEO Review'
            : 'Active - In Progress',
          lastAction: `${user.name} ${actionText.toLowerCase()}`,
          lastActionDate: new Date(),
          lastActionUserId: user.id,
          nextRequiredAction: nextActionText,
          nextActionRole: assignedOwner.role,
          createdBy: user.id,
        },
      });

      // The timeline starts with the Secretariat's registration, then the initial active recipient.
      await addWorkflowNode(tx, matterId, {
        level: 'BOARD_SECRETARIAT',
        label: 'Board Secretariat',
        user,
        status: 'COMPLETED',
        actedAt: new Date(),
        actionTaken: actionText,
        comment: body.comment ?? null,
      });

      if (initialRouteToCeo) {
        await addWorkflowNode(tx, matterId, {
          level: 'CEO',
          label: 'CEO / CEO Secretariat',
          user: ceo,
          status: 'ACTIVE',
        });
      } else {
        const nodeLevel = (
          ['CHIEF', 'DEPUTY_CHIEF', 'DIRECTOR', 'BOARD_SECRETARIAT'].includes(assignedOwner.role)
            ? assignedOwner.role
            : 'CEO'
        ) as 'BOARD_SECRETARIAT' | 'CEO' | 'CHIEF' | 'DEPUTY_CHIEF' | 'DIRECTOR';

        await addWorkflowNode(tx, matterId, {
          level: nodeLevel,
          label: `${assignedOwner.title} - ${assignedOwner.name}`,
          user: assignedOwner,
          status: 'ACTIVE',
        });
      }

      await appendAudit(tx, {
        matterId,
        user,
        action: 'Matter Created',
        newOwner: { id: assignedOwner.id, name: assignedOwner.name, role: assignedOwner.role },
        newStatus: initialRouteToCeo ? 'Under Review' : 'Assigned',
        comment: body.comment ?? `Registered ${body.matterType}: ${body.title}`,
      });

      const recipients = await filterNotifiableUsers(tx, matterId, [assignedOwner.id]);
      await notify(tx, recipients, {
        matterId,
        title: 'New BOD Matter Received',
        message: `${user.name} registered ${matterId} (${body.matterType}) and assigned it for your review/action.`,
        type: 'ASSIGNMENT',
      });

      return getMatter(tx, matterId);
    });
  });
}
