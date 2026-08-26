import { requireUser, HttpError } from '@/lib/auth';
import { handle } from '@/lib/handler';
import { prisma } from '@/lib/prisma';
import { getPermissions } from '@/lib/permissions.server';
import { PERMISSIONS, hasAnyPermission } from '@/lib/permissions';
import { announcementAudiencePool, targetableRoles } from '@/lib/announcements.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Everything the announcement form needs to build an audience.
 *
 * Only officers whose role can actually view announcements are offered, and
 * only roles that carry the view permission are listed — picking an audience
 * that provably reaches nobody is a trap, not a feature. The lists come from
 * the live role registry and the department registry rather than a hard-coded
 * vocabulary, so a directorate added this morning is selectable this afternoon.
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const permissions = await getPermissions(user);

    if (
      !hasAnyPermission(permissions, [
        PERMISSIONS.ANNOUNCEMENT_CREATE,
        PERMISSIONS.ANNOUNCEMENT_EDIT,
      ])
    ) {
      throw new HttpError(403, 'You do not have permission to compose announcements.');
    }

    const [pool, roles, departments] = await Promise.all([
      announcementAudiencePool(),
      targetableRoles(),
      prisma.department.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { name: true, businessArea: true },
      }),
    ]);

    // Business areas are taken from both registries: a directorate can exist in
    // an area before anyone is posted to it, and an officer can sit in one that
    // has no directorate row yet.
    const businessAreas = [
      ...new Set([...pool.map((u) => u.businessArea), ...departments.map((d) => d.businessArea)]),
    ]
      .filter(Boolean)
      .sort();

    return {
      roles,
      departments: departments.map((d) => d.name),
      businessAreas,
      users: pool
        .map((u) => ({
          id: u.id,
          name: u.name,
          role: u.role,
          department: u.department,
          businessArea: u.businessArea,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}
