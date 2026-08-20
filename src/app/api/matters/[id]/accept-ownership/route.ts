import { requireUser, HttpError } from '@/lib/auth';
import { assertMatterAccess } from '@/lib/authz';
import { handle, readJson } from '@/lib/handler';
import { transaction } from '@/lib/prisma';
import { getMatter, appendAudit, lockMatter } from '@/lib/repo';
import { MatterStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The recipient confirms they are responsible (spec §5). Until this happens a
 * matter has merely arrived; accepting is what settles accountability.
 */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await assertMatterAccess(user, id);

    const { comment } = await readJson<{ comment?: string }>(req).catch(() => ({ comment: undefined }));

    return transaction(async (tx) => {
      await lockMatter(tx, id);
      const matter = (await tx.matter.findUnique({ where: { id } }))!;

      if (matter.currentOwnerId !== user.id) {
        throw new HttpError(403, 'Only the current assigned owner can accept ownership.');
      }
      if (matter.status === 'Closed') {
        throw new HttpError(409, 'This BOD matter is closed.');
      }
      if (matter.status === 'In Progress') {
        throw new HttpError(409, 'You have already accepted ownership of this matter.');
      }

      const previousStatus = matter.status as MatterStatus;
      const isDirector = user.role === 'DIRECTOR';
      const nextAction = isDirector
        ? 'Director to carry out execution and submit formal Implementation Report'
        : `${user.title} to progress matter or delegate to the responsible level`;

      await tx.matter.update({
        where: { id },
        data: {
          status: 'In Progress',
          currentStage: `Ownership accepted by ${user.title}`,
          nextRequiredAction: nextAction,
          nextActionRole: user.role,
          overallStatus: 'Active - Under Execution',
          lastAction: `${user.name} (${user.title}) accepted ownership`,
          lastActionDate: new Date(),
          lastActionUserId: user.id,
          updatedAt: new Date(),
        },
      });

      await appendAudit(tx, {
        matterId: id,
        user,
        action: 'Matter Accepted',
        previousStatus,
        newStatus: 'In Progress',
        comment: comment || `Ownership accepted by ${user.title}`,
      });

      return getMatter(tx, id);
    });
  });
}
