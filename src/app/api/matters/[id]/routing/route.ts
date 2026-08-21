import { requireUser, HttpError } from '@/lib/auth';
import { assertMatterAccess, filterNotifiableUsers } from '@/lib/authz';
import { handle, readJson, badRequest } from '@/lib/handler';
import { transaction } from '@/lib/prisma';
import {
  getMatter,
  getUser,
  appendAudit,
  addWorkflowNode,
  completeActiveNode,
  lockMatter,
  notify,
} from '@/lib/repo';
import { MatterStatus, Role, WorkflowNode } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const LEVEL_FOR_ROLE: Record<string, WorkflowNode['level']> = {
  CEO: 'CEO',
  CEO_SECRETARIAT: 'CEO',
  CHIEF: 'CHIEF',
  DEPUTY_CHIEF: 'DEPUTY_CHIEF',
  DIRECTOR: 'DIRECTOR',
  BOARD_SECRETARIAT: 'BOARD_SECRETARIAT',
};

/** Operational seniority. A matter only ever moves down this ladder. */
const RANK: Record<string, number> = {
  BOARD_SECRETARIAT: 0,
  CEO: 1,
  CEO_SECRETARIAT: 1,
  CHIEF: 2,
  DEPUTY_CHIEF: 3,
  DIRECTOR: 4,
};

/**
 * Forwards or assigns a matter.
 *
 * Forward asks the recipient to review and decide the next step; Assign makes
 * them responsible. The distinction is preserved in both the status and the
 * audit trail (spec §5).
 */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await assertMatterAccess(user, id);

    const { actionType, targetUserId, comment } = await readJson<{
      actionType?: 'FORWARD' | 'ASSIGN';
      targetUserId?: string;
      comment?: string;
    }>(req);

    if (!targetUserId) badRequest('targetUserId is required');
    const isAssign = actionType === 'ASSIGN';

    return transaction(async (tx) => {
      await lockMatter(tx, id);
      const matter = (await tx.matter.findUnique({
        where: { id },
        include: { currentOwner: { select: { name: true, role: true } } },
      }))!;

      if (matter.status === 'Closed') {
        throw new HttpError(409, 'This BOD matter is closed and can no longer be routed.');
      }

      // Only the person holding the matter (or CEO_SECRETARIAT acting for CEO) can move it on.
      const isOwner = matter.currentOwnerId === user.id;
      const isCeoSecretariatActingForCeo = user.role === 'CEO_SECRETARIAT' && (matter.currentOwner.role === 'CEO' || isOwner);
      const isBoardSecretariat = user.role === 'BOARD_SECRETARIAT';

      if (!isOwner && !isCeoSecretariatActingForCeo && !isBoardSecretariat) {
        throw new HttpError(
          403,
          'You are not authorized to route this matter.'
        );
      }

      // The Director is the final operational level (spec §2).
      if (user.role === 'DIRECTOR') {
        throw new HttpError(
          400,
          'The Director is the final operational level and cannot assign or forward the matter to a lower level.'
        );
      }

      const target = await getUser(tx, targetUserId!);
      if (!target) badRequest('Target recipient user not found');

      if (target.id === user.id || target.id === matter.currentOwnerId) {
        badRequest('A matter cannot be routed to its current owner.');
      }

      // Routing is downward through the hierarchy; it never promotes a matter
      // back up as an assignment.
      const fromRank = RANK[user.role] ?? 99;
      const toRank = RANK[target.role] ?? 99;
      if (toRank <= fromRank && !(user.role === 'CEO_SECRETARIAT' && target.role === 'CHIEF')) {
        badRequest(
          `A matter cannot be routed from ${user.role} to ${target.role}: routing moves down the operational hierarchy.`
        );
      }

      const previousStatus = matter.status as MatterStatus;
      const previousOwner = {
        id: matter.currentOwnerId,
        name: matter.currentOwner.name,
        role: matter.currentOwner.role as Role,
      };
      const newStatus: MatterStatus = isAssign ? 'Assigned' : 'Under Review';
      const verb = isAssign ? 'assigned' : 'forwarded';

      const isDirector = target.role === 'DIRECTOR';
      const currentStage = isDirector
        ? `Assigned to Final Operational Owner: ${target.name}`
        : `Under Review by ${target.title}`;
      const nextAction = isDirector
        ? 'Director to accept ownership and execute directive'
        : `${target.title} to review and route/assign`;

      await completeActiveNode(
        tx,
        id,
        `${isAssign ? 'Assigned' : 'Forwarded'} to ${target.name} (${target.title})`,
        comment ?? null
      );

      await tx.matter.update({
        where: { id },
        data: {
          currentOwnerId: target.id,
          status: newStatus,
          currentStage,
          nextRequiredAction: nextAction,
          nextActionRole: target.role,
          lastAction: `${user.name} (${user.title}) ${verb} matter to ${target.name}`,
          lastActionDate: new Date(),
          lastActionUserId: user.id,
          // Routing to a level also records who now holds that level for this
          // matter; the other two designations are left as they were.
          ...(isDirector ? { responsibleDirectorId: target.id } : {}),
          ...(target.role === 'CHIEF' ? { responsibleChiefId: target.id } : {}),
          ...(target.role === 'DEPUTY_CHIEF' ? { responsibleDeputyChiefId: target.id } : {}),
          updatedAt: new Date(),
        },
      });

      await addWorkflowNode(tx, id, {
        level: LEVEL_FOR_ROLE[target.role] ?? 'DIRECTOR',
        label: target.title,
        user: target,
        status: 'ACTIVE',
      });

      await appendAudit(tx, {
        matterId: id,
        user,
        action: isAssign ? 'Matter Assigned' : 'Matter Forwarded',
        previousOwner,
        newOwner: { id: target.id, name: target.name, role: target.role },
        previousStatus,
        newStatus,
        comment: comment || `${isAssign ? 'Assigned' : 'Forwarded'} to ${target.name}`,
      });

      const recipients = await filterNotifiableUsers(tx, id, [target.id]);
      await notify(tx, recipients, {
        matterId: id,
        title: isAssign ? 'BOD Matter Assigned to You' : 'BOD Matter Forwarded to You',
        message: `${user.name} (${user.title}) ${verb} ${id} to you.`,
        type: isAssign ? 'ASSIGNMENT' : 'FORWARD',
      });

      return getMatter(tx, id);
    });
  });
}
