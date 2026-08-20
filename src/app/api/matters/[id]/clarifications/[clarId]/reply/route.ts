import { requireUser, HttpError } from '@/lib/auth';
import { assertMatterAccess, filterNotifiableUsers } from '@/lib/authz';
import { handle, readJson, badRequest } from '@/lib/handler';
import { transaction } from '@/lib/prisma';
import { getMatter, appendAudit, lockMatter, notify } from '@/lib/repo';
import { MatterStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; clarId: string }> };

/**
 * Answers a clarification. Only the person the question was addressed to may
 * answer, and only once — otherwise a bystander could close out someone else's
 * open question and resume the matter on their behalf.
 */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id, clarId } = await params;
    await assertMatterAccess(user, id);

    const { responseText } = await readJson<{ responseText?: string }>(req);
    if (!responseText?.trim()) badRequest('Response text is required');

    return transaction(async (tx) => {
      await lockMatter(tx, id);
      const matter = (await tx.matter.findUnique({ where: { id } }))!;

      const thread = await tx.clarification.findFirst({ where: { id: clarId, matterId: id } });
      if (!thread) throw new HttpError(404, 'Clarification thread not found');

      if (thread.requestedToId !== user.id) {
        throw new HttpError(403, 'Access Denied: this clarification was not addressed to you.');
      }
      if (thread.status === 'RESOLVED') {
        throw new HttpError(409, 'This clarification has already been answered.');
      }

      await tx.clarification.update({
        where: { id: clarId },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          response: responseText!.trim(),
          responseById: user.id,
        },
      });

      const previousStatus = matter.status as MatterStatus;

      // Any still-open question keeps the matter waiting; otherwise execution
      // resumes with whoever currently owns it.
      const stillOpen = await tx.clarification.count({
        where: { matterId: id, status: 'OPEN' },
      });
      const stillBlocked = stillOpen > 0;
      const newStatus: MatterStatus = stillBlocked ? 'Clarification Required' : 'In Progress';

      await tx.matter.update({
        where: { id },
        data: {
          status: newStatus,
          currentStage: stillBlocked
            ? 'Awaiting remaining clarification responses'
            : 'Clarification Provided; Execution Resumed',
          nextRequiredAction: stillBlocked
            ? 'Outstanding clarifications to be answered'
            : 'Responsible owner to continue execution',
          lastAction: `${user.name} provided clarification response`,
          lastActionDate: new Date(),
          lastActionUserId: user.id,
          updatedAt: new Date(),
        },
      });

      await appendAudit(tx, {
        matterId: id,
        user,
        action: 'Clarification Provided',
        previousStatus,
        newStatus,
        comment: `Clarification response: "${responseText!.trim()}"`,
      });

      const recipients = await filterNotifiableUsers(tx, id, [thread.requestedById]);
      await notify(tx, recipients, {
        matterId: id,
        title: 'Clarification Provided',
        message: `${user.name} replied to your inquiry on ${id}.`,
        type: 'CLARIFICATION',
      });

      return getMatter(tx, id);
    });
  });
}
