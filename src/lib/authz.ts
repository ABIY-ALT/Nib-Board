import { prisma, type Db } from './prisma';
import { HttpError } from './auth';
import { Role, User } from './types';
import type { Prisma } from '@/generated/prisma/client';

/**
 * The visibility rule, expressed once as a Prisma `where` fragment so that
 * listing, fetching, metrics and every write path apply exactly the same scope.
 *
 * Keeping this in one place is deliberate: an earlier implementation checked
 * scope in some handlers and not others, which let a user reach another
 * directorate's matter by editing the id in the URL. Compose it with `AND`
 * rather than spreading it into a larger object, so a caller cannot accidentally
 * overwrite one of its keys and widen the scope.
 */
export function visibilityWhere(user: User): Prisma.MatterWhereInput {
  const routedThroughMe: Prisma.MatterWhereInput = {
    workflowNodes: { some: { userId: user.id } },
  };

  switch (user.role) {
    // Institutional oversight: the Board's own secretariat, Board Members,
    // the CEO, CEO Secretariat and administrators see every Board matter bank-wide.
    case 'BOARD_SECRETARIAT':
    case 'BOARD_MEMBER':
    case 'CEO':
    case 'CEO_SECRETARIAT':
    case 'ADMIN':
      return {};

    // A Chief owns their business area, plus anything routed through them.
    case 'CHIEF':
      return {
        OR: [
          { businessArea: user.businessArea },
          { currentOwnerId: user.id },
          { responsibleChiefId: user.id },
          routedThroughMe,
        ],
      };

    // A Deputy Chief sees what they hold or were routed, and matters under
    // execution in their area.
    case 'DEPUTY_CHIEF':
      return {
        OR: [
          { currentOwnerId: user.id },
          { responsibleDeputyChiefId: user.id },
          routedThroughMe,
          {
            businessArea: user.businessArea,
            status: { in: ['In Progress', 'Implementation Submitted', 'Under Review / Confirmation'] },
          },
        ],
      };

    // A Director sees only their own matters — never a peer's.
    case 'DIRECTOR':
      return {
        OR: [
          { currentOwnerId: user.id },
          { responsibleDirectorId: user.id },
          routedThroughMe,
        ],
      };

    // An unrecognised role sees nothing. Never widen this to a default of
    // "everything" — a role added to the union but forgotten here must fail
    // closed.
    default:
      return { id: { in: [] } };
  }
}

/** Does this matter fall inside the caller's organizational scope? */
export async function canAccessMatter(user: User, matterId: string, db: Db = prisma): Promise<boolean> {
  const hit = await db.matter.findFirst({
    where: { AND: [{ id: matterId }, visibilityWhere(user)] },
    select: { id: true },
  });
  return hit !== null;
}

/**
 * Asserts the matter exists and is within scope, throwing the right status.
 * Every matter-scoped route — read or write — must call this before doing
 * anything else with the id.
 */
export async function assertMatterAccess(user: User, matterId: string): Promise<void> {
  const exists = await prisma.matter.findUnique({ where: { id: matterId }, select: { id: true } });
  if (!exists) {
    throw new HttpError(404, 'BOD Matter not found');
  }
  if (!(await canAccessMatter(user, matterId))) {
    throw new HttpError(
      403,
      'Access Denied: You do not have authorization to act on this BOD matter under your organizational scope.'
    );
  }
}

/** Restricts an action to a set of roles. */
export function assertRole(user: User, roles: Role[], message: string): void {
  if (!roles.includes(user.role)) {
    throw new HttpError(403, message);
  }
}

/** Ids of every matter visible to the caller — used by metrics and reporting. */
export async function visibleMatterIds(user: User): Promise<string[]> {
  const rows = await prisma.matter.findMany({
    where: visibilityWhere(user),
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Recipients who may be told about a matter. Notifications must never reach a
 * user who could not open the matter (spec §13), so candidates are filtered
 * through the same visibility rule rather than a separate list.
 */
export async function filterNotifiableUsers(
  db: Db,
  matterId: string,
  candidateIds: Array<string | null | undefined>
): Promise<string[]> {
  const unique = [...new Set(candidateIds)].filter((id): id is string => Boolean(id));
  if (unique.length === 0) return [];

  const candidates = await db.user.findMany({
    where: { id: { in: unique }, isActive: true },
    select: { id: true, role: true, businessArea: true },
  });

  const allowed: string[] = [];
  for (const candidate of candidates) {
    const asUser = {
      id: candidate.id,
      role: candidate.role as Role,
      businessArea: candidate.businessArea,
    } as User;
    if (await canAccessMatter(asUser, matterId, db)) allowed.push(candidate.id);
  }
  return allowed;
}
