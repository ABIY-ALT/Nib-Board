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
  firstUserWithRole,
  lockMatter,
  notify,
  generateId,
} from '@/lib/repo';

import { MatterStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

interface ReportBody {
  actionTaken?: string;
  whatWasImplemented?: string;
  implementationDate?: string;
  responsibleArea?: string;
  resultOutcome?: string;
  currentCondition?: string;
  remainingIssues?: string;
  reasonForPartialNonImplementation?: string;
  comments?: string;
  completionDate?: string;
  completionStatus?: 'Completed' | 'Partially Completed' | 'Ongoing Monitoring';
}

/**
 * The Director reports what was actually done (spec §6).
 *
 * This is the point the whole system exists for: a matter is never complete
 * merely because it reached the Director. The report answers what was done,
 * what resulted, what remains, and — where implementation was partial — why.
 * It then goes up for confirmation rather than closing itself.
 */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await assertMatterAccess(user, id);

    const body = await readJson<ReportBody>(req);

    return transaction(async (tx) => {
      await lockMatter(tx, id);
      const matter = (await tx.matter.findUnique({ where: { id } }))!;

      // Only the Director carrying the matter may report on it.
      if (user.role !== 'DIRECTOR' || matter.responsibleDirectorId !== user.id) {
        throw new HttpError(
          403,
          'Only the designated Director (Final Operational Level) can submit the official Implementation Report.'
        );
      }
      if (matter.status === 'Closed') {
        throw new HttpError(409, 'This BOD matter is closed.');
      }

      const required = [
        'actionTaken',
        'whatWasImplemented',
        'resultOutcome',
        'currentCondition',
        'completionStatus',
      ] as const;
      const missing = required.filter((f) => !body[f]);
      if (missing.length) {
        badRequest(
          `The Implementation Report must state: ${missing.join(', ')}. A Board matter cannot be reported complete without them.`
        );
      }

      // Partial or non-implementation must be explained (spec §6).
      if (body.completionStatus !== 'Completed' && !body.reasonForPartialNonImplementation?.trim()) {
        badRequest(
          'A reason must be given when implementation is partial or ongoing (reasonForPartialNonImplementation).'
        );
      }

      // Resubmission after a revision request replaces the report, and clears
      // the previous review so the new submission is unreviewed. Every
      // submission remains visible in the audit trail.
      const content = {
        submittedById: user.id,
        submissionDate: new Date(),
        actionTaken: body.actionTaken!,
        whatWasImplemented: body.whatWasImplemented!,
        implementationDate: body.implementationDate ? new Date(body.implementationDate) : null,
        responsibleArea: body.responsibleArea || matter.businessArea,
        resultOutcome: body.resultOutcome!,
        currentCondition: body.currentCondition!,
        remainingIssues: body.remainingIssues || null,
        reasonPartial: body.reasonForPartialNonImplementation || null,
        comments: body.comments || null,
        completionDate: body.completionDate ? new Date(body.completionDate) : null,
        completionStatus: body.completionStatus!,
      };

      await tx.implementationReport.upsert({
        where: { matterId: id },
        create: { id: generateId('rep'), matterId: id, ...content },
        update: {
          ...content,
          reviewedById: null,
          reviewDate: null,
          reviewNotes: null,
          reviewDecision: null,
        },
      });

      // The report goes to the senior-most person actually involved: the
      // Deputy Chief or Chief who routed it, otherwise the CEO.
      const reviewerId = matter.responsibleDeputyChiefId ?? matter.responsibleChiefId ?? null;
      let reviewer = reviewerId ? await getUser(tx, reviewerId) : null;
      if (!reviewer) reviewer = await firstUserWithRole(tx, 'CEO');
      if (!reviewer) {
        throw new HttpError(500, 'No authorized reviewer is configured to confirm completion.');
      }

      const previousStatus = matter.status as MatterStatus;

      await completeActiveNode(tx, id, 'Submitted Implementation Report');

      await tx.matter.update({
        where: { id },
        data: {
          status: 'Implementation Submitted',
          progress: 90,
          currentOwnerId: reviewer.id,
          currentStage:
            'Implementation Report submitted; awaiting executive confirmation',
          overallStatus: 'Awaiting Confirmation',
          nextRequiredAction: `${reviewer.title} to review Implementation Report and confirm completion`,
          nextActionRole: reviewer.role,
          lastAction: `${user.name} (${user.title}) submitted the Implementation Report`,
          lastActionDate: new Date(),
          lastActionUserId: user.id,
          updatedAt: new Date(),
        },
      });

      await addWorkflowNode(tx, id, {
        level: 'REVIEW_CONFIRMATION',
        label: `Review & Confirmation (${reviewer.title})`,
        user: reviewer,
        status: 'ACTIVE',
      });

      await appendAudit(tx, {
        matterId: id,
        user,
        action: 'Implementation Submitted',
        previousOwner: { id: user.id, name: user.name, role: user.role },
        newOwner: { id: reviewer.id, name: reviewer.name, role: reviewer.role },
        previousStatus,
        newStatus: 'Implementation Submitted',
        comment: `Implementation reported as ${body.completionStatus}: ${body.actionTaken}`,
      });

      const recipients = await filterNotifiableUsers(tx, id, [reviewer.id]);
      await notify(tx, recipients, {
        matterId: id,
        title: 'Implementation Report Awaiting Your Review',
        message: `${user.name} submitted the Implementation Report for ${id}.`,
        type: 'IMPLEMENTATION_SUBMITTED',
      });

      return getMatter(tx, id);
    });
  });
}
