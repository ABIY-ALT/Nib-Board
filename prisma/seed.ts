/**
 * Loads the demonstration dataset.
 *
 * Run with `npm run db:seed`, or `npm run db:reset` to rebuild the schema from
 * the migrations first. The source of truth is the original fixture in
 * seed-data.ts, so the seeded database reproduces exactly the matters the
 * system shipped with.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/lib/password';
import {
  NIB_USERS,
  INITIAL_MATTERS,
  INITIAL_AUDIT_LOGS,
  INITIAL_NOTIFICATIONS,
} from './seed-data';

const MATTER_TYPES = [
  'Decision',
  'Directive',
  'Resolution',
  'Instruction',
  'Policy / Rule',
  'Other Board Direction',
];

/** A fixture date string, as the Date its column wants — or null when blank. */
const date = (v: string | undefined | null): Date | null => (v ? new Date(v) : null);

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    // audit_logs and auth_events reject DELETE by trigger, so the reset goes
    // through TRUNCATE — which the triggers do not intercept — rather than
    // Prisma's deleteMany.
    await prisma.$executeRawUnsafe(`
      TRUNCATE notifications, audit_logs, auth_events, sessions, implementation_reports,
               clarifications, workflow_nodes, documents, matters, matter_types, users
      RESTART IDENTITY CASCADE
    `);

    await prisma.matterType.createMany({
      data: MATTER_TYPES.map((name, i) => ({ name, sortOrder: (i + 1) * 10 })),
    });

    // Every seeded officer account gets the same temporary credential and is
    // flagged mustChangePassword, so the shared value cannot be used to do any
    // work: the first thing each user is forced to do is replace it.
    const temporaryPassword = process.env.SEED_PASSWORD ?? 'NibBoard#2026temp';
    const temporaryHash = await hashPassword(temporaryPassword);

    // The administrator is the exception, in both directions. It is exempt from
    // the forced change (see passwordChangeEnforced in src/lib/session.ts),
    // because it is the account used to recover the others — so it must not
    // share the temporary credential every officer is handed. It gets its own.
    const adminPassword = process.env.ADMIN_PASSWORD ?? 'Nib@Admin2026';
    const adminHash = await hashPassword(adminPassword);

    await prisma.user.createMany({
      data: NIB_USERS.map((u) => {
        const isAdmin = u.role === 'ADMIN';
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          title: u.title,
          businessArea: u.businessArea,
          department: u.department ?? null,
          phone: u.phone ?? null,
          passwordHash: isAdmin ? adminHash : temporaryHash,
          mustChangePassword: !isAdmin,
        };
      }),
    });

    for (const m of INITIAL_MATTERS) {
      await prisma.matter.create({
        data: {
          id: m.id,
          resolutionNumber: m.resolutionNumber,
          matterType: m.matterType,
          title: m.title,
          description: m.description,
          boardMeetingDate: date(m.boardMeetingDate),
          boardDecisionDate: new Date(m.boardDecisionDate),
          effectiveDate: date(m.effectiveDate),
          deadline: new Date(m.deadline),
          priority: m.priority,
          businessArea: m.businessArea,
          responsibleChiefId: m.responsibleChiefId ?? null,
          responsibleDeputyChiefId: m.responsibleDeputyChiefId ?? null,
          responsibleDirectorId: m.responsibleDirectorId,
          currentOwnerId: m.currentOwnerId,
          accountableExecutiveId: m.accountableExecutiveId ?? null,
          status: m.status,
          progress: m.progress,
          currentStage: m.currentStage,
          overallStatus: m.overallStatus,
          lastAction: m.lastAction,
          lastActionDate: date(m.lastActionDate),
          lastActionUserId: m.lastActionUserId || null,
          nextRequiredAction: m.nextRequiredAction,
          nextActionRole: m.nextActionRole,
          createdAt: new Date(m.createdAt),
          createdBy: m.createdBy,
          updatedAt: new Date(m.updatedAt),
          closedAt: date(m.closedAt),
          closedBy: m.closedBy ?? null,

          documents: {
            create: m.documents.map((d) => ({
              id: d.id,
              name: d.name,
              category: d.category,
              fileType: d.fileType,
              fileSize: d.fileSize,
              // The fixture names the uploader; the database references them.
              uploadedById: NIB_USERS.find((u) => u.name === d.uploadedBy)?.id ?? m.createdBy,
              uploadedByRole: d.uploadedByRole,
              uploadedAt: new Date(d.uploadedAt),
              description: d.description ?? null,
            })),
          },

          workflowNodes: {
            create: m.routingPath.map((n, seq) => ({
              id: n.id,
              seq: seq + 1,
              level: n.level,
              label: n.label,
              userId: n.userId,
              role: n.role,
              businessArea: n.businessArea,
              assignedAt: new Date(n.assignedAt),
              actedAt: date(n.actedAt),
              actionTaken: n.actionTaken ?? null,
              status: n.status,
              comment: n.comment ?? null,
            })),
          },

          clarifications: {
            create: m.clarifications.map((c) => ({
              id: c.id,
              requestedById: c.requestedBy,
              requestedToId: c.requestedTo,
              requestedAt: new Date(c.requestedAt),
              question: c.question,
              status: c.status,
              resolvedAt: date(c.resolvedAt),
              response: c.response ?? null,
              responseById: c.responseBy ?? null,
            })),
          },
        },
      });

      const r = m.implementationReport;
      if (r) {
        await prisma.implementationReport.create({
          data: {
            id: r.id,
            matterId: m.id,
            submittedById: r.submittedBy,
            submissionDate: new Date(r.submissionDate),
            actionTaken: r.actionTaken,
            whatWasImplemented: r.whatWasImplemented,
            implementationDate: date(r.implementationDate),
            responsibleArea: r.responsibleArea,
            resultOutcome: r.resultOutcome,
            currentCondition: r.currentCondition,
            remainingIssues: r.remainingIssues,
            reasonPartial: r.reasonForPartialNonImplementation ?? null,
            comments: r.comments,
            completionDate: date(r.completionDate),
            completionStatus: r.completionStatus,
            reviewedById: r.reviewedBy
              ? NIB_USERS.find((u) => u.name === r.reviewedBy)?.id ?? null
              : null,
            reviewDate: date(r.reviewDate),
            reviewNotes: r.reviewNotes ?? null,
            reviewDecision: r.reviewDecision ?? null,
          },
        });
      }
    }

    const knownMatterIds = new Set(INITIAL_MATTERS.map((m) => m.id));

    await prisma.auditLog.createMany({
      data: INITIAL_AUDIT_LOGS.filter((l) => knownMatterIds.has(l.matterId)).map((l) => ({
        matterId: l.matterId,
        occurredAt: new Date(l.timestamp),
        userId: l.userId,
        userName: l.userName,
        userRole: l.userRole,
        userTitle: l.userTitle,
        action: l.action,
        previousOwnerId: l.previousOwner?.id ?? null,
        previousOwnerName: l.previousOwner?.name ?? null,
        previousOwnerRole: l.previousOwner?.role ?? null,
        newOwnerId: l.newOwner?.id ?? null,
        newOwnerName: l.newOwner?.name ?? null,
        newOwnerRole: l.newOwner?.role ?? null,
        previousStatus: l.previousStatus ?? null,
        newStatus: l.newStatus ?? null,
        comment: l.comment ?? null,
        supportingDocName: l.supportingDocName ?? null,
      })),
    });

    await prisma.notification.createMany({
      data: INITIAL_NOTIFICATIONS.filter((n) => knownMatterIds.has(n.matterId)).map((n) => ({
        id: n.id,
        userId: n.userId,
        matterId: n.matterId,
        title: n.title,
        message: n.message,
        type: n.type,
        createdAt: new Date(n.timestamp),
        isRead: n.isRead,
      })),
    });

    console.log('Seeded:', {
      users: await prisma.user.count(),
      matterTypes: await prisma.matterType.count(),
      matters: await prisma.matter.count(),
      documents: await prisma.document.count(),
      workflowNodes: await prisma.workflowNode.count(),
      auditLogs: await prisma.auditLog.count(),
      notifications: await prisma.notification.count(),
    });

    console.log(
      [
        '',
        `Officer accounts share the temporary password "${temporaryPassword}" and must change it`,
        'at first sign-in. Set SEED_PASSWORD to choose a different one.',
        '',
        `The administrator (admin@nibbank.et) signs in with "${adminPassword}" and is NOT forced`,
        'to change it. Set ADMIN_PASSWORD to choose a different one.',
        '',
        "Sign in with the account's email address.",
        '',
      ].join('\n')
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
