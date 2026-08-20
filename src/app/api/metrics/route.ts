import { requireUser } from '@/lib/auth';
import { visibilityWhere } from '@/lib/authz';
import { handle } from '@/lib/handler';
import { prisma } from '@/lib/prisma';
import { DashboardMetrics } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Dashboard figures for the caller's role.
 *
 * Every figure is computed over the same visibility predicate used for listing,
 * so a role's dashboard can never count matters that role could not open — the
 * totals and the list always agree.
 *
 * One scoped read of five columns, tallied here, rather than a dozen aggregate
 * queries. A bank's Board register is thousands of rows at the outside, so the
 * scan is cheap and every figure is guaranteed to come from one consistent
 * snapshot instead of a dozen separately-timed ones. If the register ever grows
 * past that, this is the place to move back to `groupBy` and `count`.
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();

    const rows = await prisma.matter.findMany({
      where: visibilityWhere(user),
      select: {
        matterType: true,
        status: true,
        priority: true,
        businessArea: true,
        deadline: true,
        currentOwnerId: true,
        nextActionRole: true,
      },
    });

    const tally = (values: string[]): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const v of values) out[v] = (out[v] ?? 0) + 1;
      return out;
    };

    // Deadlines are calendar dates; compare them as such rather than against
    // "now", so a matter due today is never counted overdue at 00:01.
    const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
    const inSevenDays = today + 7 * 86_400_000;
    const dueDate = (d: Date) => d.getTime();

    const open = rows.filter((m) => m.status !== 'Closed');
    const count = (predicate: (m: (typeof rows)[number]) => boolean) =>
      rows.filter(predicate).length;

    const metrics: DashboardMetrics = {
      totalMatters: rows.length,
      byType: tally(rows.map((m) => m.matterType)),
      byStatus: tally(rows.map((m) => m.status)),
      byPriority: tally(rows.map((m) => m.priority)),
      byBusinessArea: tally(rows.map((m) => m.businessArea)),

      overdueCount: open.filter((m) => dueDate(m.deadline) < today).length,
      dueSoonCount: open.filter(
        (m) => dueDate(m.deadline) >= today && dueDate(m.deadline) <= inSevenDays
      ).length,

      myOwnedCount: count((m) => m.currentOwnerId === user.id && m.status !== 'Closed'),
      myActionRequiredCount: count(
        (m) =>
          m.currentOwnerId === user.id &&
          m.status !== 'Closed' &&
          m.status !== 'In Progress'
      ),

      inProgressCount: count((m) => m.status === 'In Progress'),
      implementationSubmittedCount: count((m) => m.status === 'Implementation Submitted'),
      closedCount: count((m) => m.status === 'Closed'),

      awaitingCeoCount: open.filter((m) => m.nextActionRole === 'CEO').length,
      awaitingChiefCount: open.filter((m) => m.nextActionRole === 'CHIEF').length,
      awaitingDirectorCount: open.filter((m) => m.nextActionRole === 'DIRECTOR').length,
    };

    return metrics;
  });
}
