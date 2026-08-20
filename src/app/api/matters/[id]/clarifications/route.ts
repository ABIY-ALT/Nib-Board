import { requireUser, HttpError } from '@/lib/auth';
import { assertMatterAccess, filterNotifiableUsers } from '@/lib/authz';
import { handle, readJson, badRequest } from '@/lib/handler';
import { transaction } from '@/lib/prisma';
import { getMatter, getUser, appendAudit, lockMatter, notify, generateId } from '@/lib/repo';
import { MatterStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Asks a named person for more information before proceeding (spec §5). */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await assertMatterAccess(user, id);

    const { targetUserId, question } = await readJson<{
      targetUserId?: string;
      question?: string;
    }>(req);

    if (!targetUserId || !question?.trim()) {
      badRequest('Missing target user or question for clarification');
    }

    return transaction(async (tx) => {
      await lockMatter(tx, id);
      const matter = (await tx.matter.findUnique({ where: { id } }))!;
      if (matter.status === 'Closed') {
        throw new HttpError(409, 'This BOD matter is closed.');
      }

      const target = await getUser(tx, targetUserId!);
      if (!target) badRequest('Target recipient user not found');
      if (target.id === user.id) {
        badRequest('You cannot request clarification from yourself.');
      }

      const previousStatus = matter.status as MatterStatus;

      await tx.clarification.create({
        data: {
          id: generateId('clar'),
          matterId: id,
          requestedById: user.id,
          requestedToId: target.id,
          question: question!.trim(),
          status: 'OPEN',
        },
      });

      await tx.matter.update({
        where: { id },
        data: {
          status: 'Clarification Required',
          currentStage: `Clarification Requested from ${target.title}`,
          nextRequiredAction: `${target.name} (${target.title}) to provide written clarification`,
          nextActionRole: target.role,
          lastAction: `${user.name} requested clarification from ${target.name}`,
          lastActionDate: new Date(),
          lastActionUserId: user.id,
          updatedAt: new Date(),
        },
      });

      await appendAudit(tx, {
        matterId: id,
        user,
        action: 'Clarification Requested',
        previousStatus,
        newStatus: 'Clarification Required',
        comment: `Clarification sought from ${target.name}: "${question!.trim()}"`,
      });

      const recipients = await filterNotifiableUsers(tx, id, [target.id]);
      await notify(tx, recipients, {
        matterId: id,
        title: 'Clarification Requested on BOD Matter',
        message: `${user.name} (${user.title}) requested clarification on ${id}.`,
        type: 'CLARIFICATION',
      });

      return getMatter(tx, id);
    });
  });
}
