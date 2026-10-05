/**
 * Loads the demonstration dataset.
 *
 * Run with `npm run db:seed`, or `npm run db:reset` to rebuild the schema from
 * the migrations first. The source of truth is the original fixture in
 * seed-data.ts, so the seeded database reproduces exactly the matters the
 * system shipped with.
 */
import 'dotenv/config';
import { randomBytes } from 'crypto';
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

/**
 * A credential from the environment, or a random one when none is set.
 *
 * There used to be a fixed fallback for each, written in this file — so any
 * database seeded without setting them had an administrator password, exempt
 * from forced change, that anyone with the source could read.
 */
function credential(name: string): { value: string; generated: boolean } {
  const configured = process.env[name];
  if (configured) return { value: configured, generated: false };
  return { value: `Nib-${randomBytes(12).toString('base64url')}`, generated: true };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  // The first thing this script does is TRUNCATE every table, including the
  // append-only audit logs. Pointed at a live database by mistake, it erases
  // the Board register and its history, so it runs only when asked to.
  if (process.env.ALLOW_SEED !== 'true') {
    throw new Error(
      'Refusing to seed: this ERASES every table, audit logs included. Set ALLOW_SEED=true to run it against a disposable database.'
    );
  }

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
    const temporaryPassword = credential('SEED_PASSWORD');
    const temporaryHash = await hashPassword(temporaryPassword.value);

    // The administrator is the exception, in both directions. It is exempt from
    // the forced change (see passwordChangeEnforced in src/lib/session.ts),
    // because it is the account used to recover the others — so it must not
    // share the temporary credential every officer is handed. It gets its own.
    const adminPassword = credential('ADMIN_PASSWORD');
    const adminHash = await hashPassword(adminPassword.value);

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
      data: INITIAL_NOTIFICATIONS.filter(
        (n): n is typeof n & { matterId: string } =>
          n.matterId !== undefined && knownMatterIds.has(n.matterId)
      ).map((n) => ({
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

    // A password that came from the environment is never echoed: seed output
    // ends up in terminals and CI logs. One generated here is shown once,
    // because nobody else knows it.
    const shown = (c: { value: string; generated: boolean }, name: string) =>
      c.generated ? `the generated password "${c.value}"` : `the value of ${name}`;

    console.log(
      [
        '',
        `Officer accounts share ${shown(temporaryPassword, 'SEED_PASSWORD')} and must change it`,
        'at first sign-in.',
        '',
        `The administrator (admin@nibbank.com.et) signs in with ${shown(adminPassword, 'ADMIN_PASSWORD')}`,
        'and is NOT forced to change it.',
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
