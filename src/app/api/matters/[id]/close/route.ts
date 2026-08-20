import { requireUser, HttpError } from '@/lib/auth';
import { assertMatterAccess, assertRole, filterNotifiableUsers } from '@/lib/authz';
import { handle, readJson } from '@/lib/handler';
import { transaction } from '@/lib/prisma';
import { getMatter, appendAudit, addWorkflowNode, lockMatter, notify } from '@/lib/repo';
import { MatterStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Formal closure — the end of the Board matter's life.
 *
 * Closure is not reachable from execution: the Director must have submitted an
 * Implementation Report and an authorized executive must have confirmed it.
 * Without this rule a matter could be marked done merely because it reached the
 * Director, which is exactly what spec §6 forbids.
 */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await assertMatterAccess(user, id);
    assertRole(
      user,
      ['BOARD_SECRETARIAT', 'CEO', 'ADMIN'],
      'Only Board Secretariat or CEO is authorized to formally close a BOD matter.'
    );

    const { closureNotes } = await readJson<{ closureNotes?: string }>(req).catch(() => ({
      closureNotes: undefined,
    }));

    return transaction(async (tx) => {
      await lockMatter(tx, id);
      const matter = (await tx.matter.findUnique({ where: { id } }))!;

      if (matter.status === 'Closed') {
        throw new HttpError(409, 'This BOD matter is already closed.');
      }
      if (matter.status !== 'Under Review / Confirmation') {
        throw new HttpError(
          409,
          'This BOD matter cannot be closed yet: the Director must submit an Implementation Report and an authorized executive must confirm it before formal closure.'
        );
      }

      const previousStatus = matter.status as MatterStatus;

      // Nothing is still in play once the matter is closed, so every
      // outstanding node is settled and the timeline reads as a finished path.
      // A node that was never acted on keeps a null actedAt in Postgres via
      // COALESCE; Prisma cannot express that in one updateMany, so the two
      // cases are settled separately.
      await tx.workflowNode.updateMany({
        where: { matterId: id, status: { in: ['ACTIVE', 'PENDING'] }, actedAt: null },
        data: { status: 'COMPLETED', actedAt: new Date() },
      });
      await tx.workflowNode.updateMany({
        where: { matterId: id, status: { in: ['ACTIVE', 'PENDING'] } },
        data: { status: 'COMPLETED' },
      });

      const now = new Date();
      await tx.matter.update({
        where: { id },
        data: {
          status: 'Closed',
          progress: 100,
          currentStage: 'Formally closed and catalogued in Board records',
          overallStatus: 'Successfully Closed & Archival Complete',
          nextRequiredAction: 'None (Matter Officially Closed)',
          nextActionRole: null,
          lastAction: `Formally closed by ${user.name} (${user.title})`,
          lastActionDate: now,
          lastActionUserId: user.id,
          closedAt: now,
          closedBy: user.id,
          updatedAt: now,
        },
      });

      await addWorkflowNode(tx, id, {
        level: 'CLOSED',
        label: 'Closed',
        user,
        status: 'COMPLETED',
        actedAt: new Date(),
        actionTaken: 'Formally closed and archived',
        comment: closureNotes ?? null,
      });

      await appendAudit(tx, {
        matterId: id,
        user,
        action: 'Matter Closed',
        previousStatus,
        newStatus: 'Closed',
        comment: closureNotes || 'Board matter formally closed.',
      });

      const recipients = await filterNotifiableUsers(tx, id, [
        matter.responsibleDirectorId,
        matter.responsibleChiefId,
        matter.responsibleDeputyChiefId,
      ]);
      await notify(tx, recipients, {
        matterId: id,
        title: 'BOD Matter Closed',
        message: `${id} has been formally closed by ${user.name}.`,
        type: 'STATUS_CHANGE',
      });

      return getMatter(tx, id);
    });
  });
}
