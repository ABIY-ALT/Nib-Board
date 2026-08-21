import { requireUser, HttpError } from '@/lib/auth';
import { assertMatterAccess, assertRole, filterNotifiableUsers } from '@/lib/authz';
import { handle, readJson, badRequest } from '@/lib/handler';
import { transaction } from '@/lib/prisma';
import { getMatter, getUser, appendAudit, firstUserWithRole, lockMatter, notify } from '@/lib/repo';
import { MatterStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * An authorized executive reviews the Director's report and either confirms it
 * or sends it back for revision (spec §5).
 *
 * The reviewer's notes are written into the permanent report, so the record
 * carries not just that completion was confirmed but on what basis.
 */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await assertMatterAccess(user, id);
    assertRole(
      user,
      ['CEO', 'CHIEF', 'DEPUTY_CHIEF', 'BOARD_SECRETARIAT', 'ADMIN'],
      'You are not authorized to confirm implementation completion.'
    );

    const { decision, reviewNotes } = await readJson<{
      decision?: 'Approved' | 'Revision Requested';
      reviewNotes?: string;
    }>(req);

    if (decision !== 'Approved' && decision !== 'Revision Requested') {
      badRequest("decision must be either 'Approved' or 'Revision Requested'");
    }
    if (decision === 'Revision Requested' && !reviewNotes?.trim()) {
      badRequest('Requesting a revision requires reviewNotes explaining what must change.');
    }

    return transaction(async (tx) => {
      await lockMatter(tx, id);
      const matter = (await tx.matter.findUnique({ where: { id } }))!;

      if (matter.status !== 'Implementation Submitted') {
        throw new HttpError(
          409,
          'There is no submitted Implementation Report awaiting confirmation on this matter.'
        );
      }

      const report = await tx.implementationReport.findUnique({
        where: { matterId: id },
        select: { id: true, submittedById: true },
      });
      if (!report) {
        throw new HttpError(409, 'This matter has no Implementation Report to review.');
      }

      await tx.implementationReport.update({
        where: { matterId: id },
        data: {
          reviewedById: user.id,
          reviewDate: new Date(),
          reviewNotes: reviewNotes ?? null,
          reviewDecision: decision,
        },
      });

      // The review node named the expected reviewer when the Director
      // submitted; reconcile it with whoever actually reviewed so the timeline
      // shows the path taken rather than the one anticipated.
      const reviewNode = await tx.workflowNode.findFirst({
        where: { matterId: id, level: 'REVIEW_CONFIRMATION' },
        orderBy: { seq: 'desc' },
        select: { id: true },
      });
      if (reviewNode) {
        await tx.workflowNode.update({
          where: { id: reviewNode.id },
          data: {
            userId: user.id,
            role: user.role,
            businessArea: user.businessArea,
            label: `Review & Confirmation (${user.title})`,
            status: 'COMPLETED',
            actedAt: new Date(),
            actionTaken:
              decision === 'Approved'
                ? 'Confirmed implementation completion'
                : 'Requested revision of the implementation report',
            comment: reviewNotes ?? null,
          },
        });
      }

      const previousStatus = matter.status as MatterStatus;

      if (decision === 'Approved') {
        const secretariat = await firstUserWithRole(tx, 'BOARD_SECRETARIAT');
        if (!secretariat) {
          throw new HttpError(500, 'No Board Secretariat user is configured to close matters.');
        }

        await tx.matter.update({
          where: { id },
          data: {
            status: 'Under Review / Confirmation',
            progress: 100,
            currentOwnerId: secretariat.id,
            currentStage:
              'Implementation confirmed by executive; pending Board Secretariat closure',
            overallStatus: 'Confirmed by Executive Management',
            nextRequiredAction: 'Board Secretariat to formally close and report to Board',
            nextActionRole: 'BOARD_SECRETARIAT',
            lastAction: `${user.name} (${user.title}) confirmed implementation completion`,
            lastActionDate: new Date(),
            lastActionUserId: user.id,
            updatedAt: new Date(),
          },
        });

        await appendAudit(tx, {
          matterId: id,
          user,
          action: 'Completion Confirmed',
          previousOwner: { id: user.id, name: user.name, role: user.role },
          newOwner: { id: secretariat.id, name: secretariat.name, role: secretariat.role },
          previousStatus,
          newStatus: 'Under Review / Confirmation',
          comment: `Implementation confirmed by ${user.title}. Notes: ${
            reviewNotes || 'Verified against Board mandate.'
          }`,
        });

        const recipients = await filterNotifiableUsers(tx, id, [
          secretariat.id,
          matter.responsibleDirectorId,
        ]);
        await notify(tx, recipients, {
          matterId: id,
          title: 'Implementation Confirmed',
          message: `${user.name} confirmed completion of ${id}; awaiting formal closure.`,
          type: 'COMPLETION_CONFIRMED',
        });
      } else {
        const targetOfficerId = report.submittedById ?? matter.responsibleDirectorId ?? matter.responsibleDeputyChiefId ?? matter.responsibleChiefId;
        const officer = targetOfficerId ? await getUser(tx, targetOfficerId) : null;
        const finalOfficer = officer || user;

        await tx.matter.update({
          where: { id },
          data: {
            status: 'In Progress',
            progress: 60,
            currentOwnerId: finalOfficer.id,
            currentStage: `Revision requested by ${user.title}`,
            overallStatus: 'Active - Revision Required',
            nextRequiredAction: `${finalOfficer.name} (${finalOfficer.title}) to address review feedback and resubmit the Implementation Report`,
            nextActionRole: finalOfficer.role,
            lastAction: `${user.name} (${user.title}) requested revision of the Implementation Report`,
            lastActionDate: new Date(),
            lastActionUserId: user.id,
            updatedAt: new Date(),
          },
        });

        await appendAudit(tx, {
          matterId: id,
          user,
          action: 'Completion Reviewed',
          previousOwner: { id: user.id, name: user.name, role: user.role },
          newOwner: { id: finalOfficer.id, name: finalOfficer.name, role: finalOfficer.role },
          previousStatus,
          newStatus: 'In Progress',
          comment: `Revision requested by ${user.title}: ${reviewNotes}`,
        });

        const recipients = await filterNotifiableUsers(tx, id, [finalOfficer.id]);
        await notify(tx, recipients, {
          matterId: id,
          title: 'Revision Requested on Implementation Report',
          message: `${user.name} asked for changes to your implementation report on ${id}.`,
          type: 'STATUS_CHANGE',
        });
      }

      return getMatter(tx, id);
    });
  });
}
