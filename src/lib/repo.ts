import { prisma, type Db } from './prisma';
import { visibilityWhere } from './authz';
import type { Prisma } from '@/generated/prisma/client';
import {
  AuditLogEntry,
  BODMatter,
  ClarificationThread,
  Document,
  ImplementationReport,
  MatterStatus,
  Role,
  User,
  WorkflowNode,
} from './types';

// ------------------------------------------------------------------ helpers

/**
 * Renders a DATE column as the plain 'YYYY-MM-DD' string it holds.
 *
 * Prisma returns `@db.Date` as a Date pinned to UTC midnight, so slicing the
 * ISO string is exact — it cannot drift a day the way a local-midnight Date
 * would east of Greenwich. Board deadlines and decision dates are calendar
 * dates with no time zone, and must never pass through a timestamp conversion.
 */
const toIsoDate = (v: Date | null): string => (v === null ? '' : v.toISOString().slice(0, 10));

const toIsoStamp = (v: Date | null): string => (v === null ? '' : v.toISOString());

/**
 * Days to deadline and overdue state are derived on read rather than stored, so
 * they cannot go stale between requests. A closed matter is never overdue.
 */
function deriveTiming(deadline: Date, status: MatterStatus) {
  if (status === 'Closed') return { daysRemaining: 0, isOverdue: false };
  const end = new Date(toIsoDate(deadline)).getTime();
  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const daysRemaining = Math.ceil((end - today) / 86_400_000);
  return { daysRemaining, isOverdue: daysRemaining < 0 };
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// -------------------------------------------------------------------- users

/** The fields that make up a directory entry. Never includes credential columns. */
const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  title: true,
  businessArea: true,
  department: true,
  phone: true,
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

function toUser(r: UserRow): User {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role as Role,
    title: r.title,
    businessArea: r.businessArea,
    department: r.department ?? undefined,
    phone: r.phone ?? undefined,
  };
}

/**
 * The sign-in roster, senior-most role first.
 *
 * Postgres has no natural ordering for the role vocabulary, and Prisma cannot
 * express a CASE in `orderBy`, so the rank is applied here. The list is one row
 * per officer — small enough that sorting in the application costs nothing.
 */
const ROLE_RANK: Record<string, number> = {
  BOARD_MEMBER: 1,
  BOARD_SECRETARIAT: 2,
  CEO: 3,
  CEO_SECRETARIAT: 3,
  CHIEF: 4,
  DEPUTY_CHIEF: 5,
  DIRECTOR: 6,
};

export async function listUsers(): Promise<User[]> {
  const rows = await prisma.user.findMany({ where: { isActive: true }, select: USER_SELECT });
  return rows
    .map(toUser)
    .sort(
      (a, b) =>
        (ROLE_RANK[a.role] ?? 6) - (ROLE_RANK[b.role] ?? 6) || a.name.localeCompare(b.name)
    );
}

/**
 * The same roster plus the accounts that have been deactivated, for the
 * administration screen — which is the only place that can reactivate one, and
 * so the only place that must be able to see one.
 *
 * Deliberately a separate function from `listUsers`: everything else in the
 * application (routing targets, notification recipients, the workload table)
 * must only ever see officers who can actually act.
 */
export async function listUsersForAdministration(): Promise<Array<User & { isActive: boolean }>> {
  const rows = await prisma.user.findMany({ select: { ...USER_SELECT, isActive: true } });
  return rows
    .map((r) => ({ ...toUser(r), isActive: r.isActive }))
    .sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) ||
        (ROLE_RANK[a.role] ?? 6) - (ROLE_RANK[b.role] ?? 6) ||
        a.name.localeCompare(b.name)
    );
}

export async function getUser(db: Db, id: string): Promise<User | null> {
  const row = await db.user.findFirst({ where: { id, isActive: true }, select: USER_SELECT });
  return row ? toUser(row) : null;
}

/** The first active holder of a role, used to route to "the CEO" or "the Secretariat". */
export async function firstUserWithRole(db: Db, role: Role): Promise<User | null> {
  const row = await db.user.findFirst({
    where: { role, isActive: true },
    orderBy: { id: 'asc' },
    select: USER_SELECT,
  });
  return row ? toUser(row) : null;
}

// ------------------------------------------------------------- matter types

export async function listMatterTypes(): Promise<string[]> {
  const rows = await prisma.matterType.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { name: true },
  });
  return rows.map((r) => r.name);
}

// ------------------------------------------------------------------ matters

/**
 * Everything a BODMatter needs, in one query.
 *
 * The client shape carries the names and titles of every party, not just their
 * ids, so the UI never has to resolve a person against a separate roster. That
 * is what all the `select: { name, title }` includes are for.
 */
const MATTER_INCLUDE = {
  currentOwner: { select: { name: true, title: true, role: true } },
  responsibleDirector: { select: { name: true, title: true } },
  responsibleChief: { select: { name: true, title: true } },
  responsibleDeputy: { select: { name: true, title: true } },
  accountableExecutive: { select: { name: true, title: true } },
  creator: { select: { name: true } },
  closer: { select: { name: true } },
  lastActionUser: { select: { name: true } },
  documents: {
    orderBy: { uploadedAt: 'asc' },
    include: { uploadedBy: { select: { name: true } } },
  },
  workflowNodes: {
    orderBy: { seq: 'asc' },
    include: { user: { select: { name: true, title: true } } },
  },
  clarifications: {
    orderBy: { requestedAt: 'desc' },
    include: {
      requestedBy: { select: { name: true, role: true, title: true } },
      requestedTo: { select: { name: true, role: true } },
      responseBy: { select: { name: true } },
    },
  },
  implementationReport: {
    include: {
      submittedBy: { select: { name: true, title: true } },
      reviewedBy: { select: { name: true, role: true, title: true } },
    },
  },
} satisfies Prisma.MatterInclude;

type MatterRow = Prisma.MatterGetPayload<{ include: typeof MATTER_INCLUDE }>;

function toMatter(r: MatterRow): BODMatter {
  const timing = deriveTiming(r.deadline, r.status as MatterStatus);

  const documents: Document[] = r.documents.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category as Document['category'],
    fileType: d.fileType,
    fileSize: d.fileSize,
    uploadedBy: d.uploadedBy.name,
    uploadedByRole: d.uploadedByRole as Role,
    uploadedAt: toIsoStamp(d.uploadedAt),
    description: d.description ?? undefined,
    sha256: d.sha256 ?? undefined,
    byteSize: d.byteSize ?? undefined,
    hasFile: Boolean(d.storageKey && d.sha256),
  }));

  const routingPath: WorkflowNode[] = r.workflowNodes.map((n) => ({
    id: n.id,
    level: n.level as WorkflowNode['level'],
    label: n.label,
    userId: n.userId,
    userName: n.user.name,
    userTitle: n.user.title,
    role: n.role as Role,
    businessArea: n.businessArea,
    assignedAt: toIsoStamp(n.assignedAt),
    actedAt: n.actedAt ? toIsoStamp(n.actedAt) : undefined,
    actionTaken: n.actionTaken ?? undefined,
    status: n.status as WorkflowNode['status'],
    comment: n.comment ?? undefined,
  }));

  const clarifications: ClarificationThread[] = r.clarifications.map((c) => ({
    id: c.id,
    requestedBy: c.requestedById,
    requesterName: c.requestedBy.name,
    requesterRole: c.requestedBy.role as Role,
    requesterTitle: c.requestedBy.title,
    requestedTo: c.requestedToId,
    recipientName: c.requestedTo.name,
    recipientRole: c.requestedTo.role as Role,
    requestedAt: toIsoStamp(c.requestedAt),
    question: c.question,
    status: c.status as ClarificationThread['status'],
    resolvedAt: c.resolvedAt ? toIsoStamp(c.resolvedAt) : undefined,
    response: c.response ?? undefined,
    responseBy: c.responseById ?? undefined,
    responseByName: c.responseBy?.name ?? undefined,
  }));

  const rep = r.implementationReport;
  const implementationReport: ImplementationReport | undefined = rep
    ? {
        id: rep.id,
        submittedBy: rep.submittedById,
        directorName: rep.submittedBy.name,
        directorTitle: rep.submittedBy.title,
        submissionDate: toIsoStamp(rep.submissionDate),
        actionTaken: rep.actionTaken,
        whatWasImplemented: rep.whatWasImplemented,
        implementationDate: toIsoDate(rep.implementationDate),
        responsibleArea: rep.responsibleArea ?? '',
        resultOutcome: rep.resultOutcome,
        currentCondition: rep.currentCondition,
        remainingIssues: rep.remainingIssues ?? '',
        reasonForPartialNonImplementation: rep.reasonPartial ?? undefined,
        evidenceDocuments: documents.filter((d) => d.category === 'IMPLEMENTATION_EVIDENCE'),
        comments: rep.comments ?? '',
        completionDate: toIsoDate(rep.completionDate),
        completionStatus: rep.completionStatus as ImplementationReport['completionStatus'],
        reviewedBy: rep.reviewedBy?.name ?? undefined,
        reviewerRole: (rep.reviewedBy?.role as Role) ?? undefined,
        reviewerTitle: rep.reviewedBy?.title ?? undefined,
        reviewDate: rep.reviewDate ? toIsoStamp(rep.reviewDate) : undefined,
        reviewNotes: rep.reviewNotes ?? undefined,
        reviewDecision: rep.reviewDecision as ImplementationReport['reviewDecision'],
      }
    : undefined;

  return {
    id: r.id,
    resolutionNumber: r.resolutionNumber,
    matterType: r.matterType as BODMatter['matterType'],
    title: r.title,
    description: r.description,
    boardMeetingDate: toIsoDate(r.boardMeetingDate),
    boardDecisionDate: toIsoDate(r.boardDecisionDate),
    effectiveDate: toIsoDate(r.effectiveDate),
    priority: r.priority as BODMatter['priority'],
    deadline: toIsoDate(r.deadline),
    businessArea: r.businessArea,

    responsibleChiefId: r.responsibleChiefId ?? undefined,
    responsibleChiefName: r.responsibleChief?.name ?? undefined,
    responsibleChiefTitle: r.responsibleChief?.title ?? undefined,
    responsibleDeputyChiefId: r.responsibleDeputyChiefId ?? undefined,
    responsibleDeputyChiefName: r.responsibleDeputy?.name ?? undefined,
    responsibleDeputyChiefTitle: r.responsibleDeputy?.title ?? undefined,
    responsibleDirectorId: r.responsibleDirectorId ?? undefined,
    responsibleDirectorName: r.responsibleDirector?.name ?? undefined,
    responsibleDirectorTitle: r.responsibleDirector?.title ?? undefined,

    currentOwnerId: r.currentOwnerId,
    currentOwnerName: r.currentOwner.name,
    currentOwnerRole: r.currentOwner.role as Role,
    currentOwnerTitle: r.currentOwner.title,

    accountableExecutiveId: r.accountableExecutiveId ?? undefined,
    accountableExecutiveName: r.accountableExecutive?.name ?? undefined,
    accountableExecutiveTitle: r.accountableExecutive?.title ?? undefined,

    status: r.status as MatterStatus,
    progress: r.progress,
    currentStage: r.currentStage,
    daysRemaining: timing.daysRemaining,
    isOverdue: timing.isOverdue,
    lastAction: r.lastAction,
    lastActionDate: r.lastActionDate ? toIsoStamp(r.lastActionDate) : '',
    lastActionUserId: r.lastActionUserId ?? '',
    lastActionUserName: r.lastActionUser?.name ?? '',
    nextRequiredAction: r.nextRequiredAction,
    nextActionRole: (r.nextActionRole as Role) ?? undefined,
    overallStatus: r.overallStatus,

    documents,
    implementationReport,
    routingPath,
    clarifications,
    createdAt: toIsoStamp(r.createdAt),
    createdBy: r.createdBy,
    createdByName: r.creator.name,
    updatedAt: toIsoStamp(r.updatedAt),
    closedAt: r.closedAt ? toIsoStamp(r.closedAt) : undefined,
    closedBy: r.closedBy ?? undefined,
    closedByName: r.closer?.name ?? undefined,
  };
}

/**
 * Takes the row lock that every workflow transition depends on.
 *
 * Prisma has no row-locking API, which makes this one of the few places raw SQL
 * genuinely earns its place. Each handler that reads a matter's status, decides
 * a transition from it and writes the result must serialise against other
 * handlers doing the same — without the lock two concurrent actions both read
 * the old status, both consider their transition legal, and the second silently
 * overwrites the first.
 *
 * Call it as the first statement inside the transaction, before reading the
 * matter. The lock is released when the transaction ends.
 */
export async function lockMatter(db: Db, id: string): Promise<void> {
  await db.$queryRaw`SELECT id FROM matters WHERE id = ${id} FOR UPDATE`;
}

/** Every matter the caller is entitled to see, newest first. */
export async function listVisibleMatters(user: User): Promise<BODMatter[]> {
  const rows = await prisma.matter.findMany({
    where: visibilityWhere(user),
    include: MATTER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toMatter);
}

/** A single matter. Callers must have already asserted access. */
export async function getMatter(db: Db, id: string): Promise<BODMatter | null> {
  const row = await db.matter.findUnique({ where: { id }, include: MATTER_INCLUDE });
  return row ? toMatter(row) : null;
}

// --------------------------------------------------------------- audit logs

export async function listAuditTrail(matterId: string): Promise<AuditLogEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { matterId },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  });

  return rows.map((r) => ({
    id: String(r.id),
    matterId: r.matterId,
    timestamp: toIsoStamp(r.occurredAt),
    userId: r.userId,
    userName: r.userName,
    userRole: r.userRole as Role,
    userTitle: r.userTitle,
    action: r.action as AuditLogEntry['action'],
    previousOwner: r.previousOwnerId
      ? {
          id: r.previousOwnerId,
          name: r.previousOwnerName ?? '',
          role: r.previousOwnerRole as Role,
          title: '',
        }
      : undefined,
    newOwner: r.newOwnerId
      ? {
          id: r.newOwnerId,
          name: r.newOwnerName ?? '',
          role: r.newOwnerRole as Role,
          title: '',
        }
      : undefined,
    previousStatus: (r.previousStatus as MatterStatus) ?? undefined,
    newStatus: (r.newStatus as MatterStatus) ?? undefined,
    comment: r.comment ?? undefined,
    supportingDocName: r.supportingDocName ?? undefined,
  }));
}

export interface AuditInput {
  matterId: string;
  user: User;
  action: AuditLogEntry['action'];
  previousOwner?: { id: string; name: string; role: Role } | null;
  newOwner?: { id: string; name: string; role: Role } | null;
  previousStatus?: MatterStatus | null;
  newStatus?: MatterStatus | null;
  comment?: string | null;
  supportingDocName?: string | null;
}

/**
 * Appends one immutable audit event.
 *
 * The actor's name, role and title are copied in rather than joined on read, so
 * the record still says who did what after that person is renamed or moves
 * role. The table's triggers reject UPDATE and DELETE outright.
 */
export async function appendAudit(db: Db, e: AuditInput): Promise<void> {
  await db.auditLog.create({
    data: {
      matterId: e.matterId,
      userId: e.user.id,
      userName: e.user.name,
      userRole: e.user.role,
      userTitle: e.user.title,
      action: e.action,
      previousOwnerId: e.previousOwner?.id ?? null,
      previousOwnerName: e.previousOwner?.name ?? null,
      previousOwnerRole: e.previousOwner?.role ?? null,
      newOwnerId: e.newOwner?.id ?? null,
      newOwnerName: e.newOwner?.name ?? null,
      newOwnerRole: e.newOwner?.role ?? null,
      previousStatus: e.previousStatus ?? null,
      newStatus: e.newStatus ?? null,
      comment: e.comment ?? null,
      supportingDocName: e.supportingDocName ?? null,
    },
  });
}

// ------------------------------------------------------------ notifications

export async function notify(
  db: Db,
  recipients: string[],
  n: { matterId: string; title: string; message: string; type: string }
): Promise<void> {
  if (recipients.length === 0) return;
  await db.notification.createMany({
    data: recipients.map((userId) => ({
      id: generateId('notif'),
      userId,
      matterId: n.matterId,
      title: n.title,
      message: n.message,
      type: n.type,
    })),
  });
}

// ----------------------------------------------------------- workflow nodes

export async function addWorkflowNode(
  db: Db,
  matterId: string,
  node: {
    level: WorkflowNode['level'];
    label: string;
    user: User;
    assignedAt?: Date;
    status: WorkflowNode['status'];
    actionTaken?: string;
    actedAt?: Date | null;
    comment?: string | null;
  }
): Promise<void> {
  const last = await db.workflowNode.aggregate({
    where: { matterId },
    _max: { seq: true },
  });

  await db.workflowNode.create({
    data: {
      id: generateId('wn'),
      matterId,
      seq: (last._max.seq ?? 0) + 1,
      level: node.level,
      label: node.label,
      userId: node.user.id,
      role: node.user.role,
      businessArea: node.user.businessArea,
      assignedAt: node.assignedAt ?? new Date(),
      actedAt: node.actedAt ?? null,
      actionTaken: node.actionTaken ?? null,
      status: node.status,
      comment: node.comment ?? null,
    },
  });
}

/** Settles whichever node is currently ACTIVE, recording what was done. */
export async function completeActiveNode(
  db: Db,
  matterId: string,
  actionTaken: string,
  comment?: string | null
): Promise<void> {
  await db.workflowNode.updateMany({
    where: { matterId, status: 'ACTIVE' },
    data: {
      status: 'COMPLETED',
      actedAt: new Date(),
      actionTaken,
      // A null comment must leave whatever the node already carried, so it is
      // simply omitted rather than written as null.
      ...(comment ? { comment } : {}),
    },
  });
}
