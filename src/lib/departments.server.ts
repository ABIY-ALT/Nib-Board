import { prisma, type Db } from './prisma';
import { DepartmentItem, INITIAL_DEPARTMENTS } from './departments';

/**
 * Ensures initial default departments are populated in the database.
 */
export async function ensureDefaultDepartments(db: Db = prisma): Promise<void> {
  const count = await db.department.count();
  if (count > 0) return;

  for (const item of INITIAL_DEPARTMENTS) {
    let directorId: string | null = null;
    if (item.directorUserEmail) {
      const dir = await db.user.findUnique({
        where: { email: item.directorUserEmail },
        select: { id: true },
      });
      if (dir) directorId = dir.id;
    }

    await db.department.create({
      data: {
        id: item.id,
        name: item.name,
        code: item.code,
        businessArea: item.businessArea,
        directorId,
        isActive: true,
      },
    });
  }
}

/**
 * Returns all departments with their assigned Director, active matters, and officer counts.
 */
export async function listDepartments(db: Db = prisma): Promise<DepartmentItem[]> {
  await ensureDefaultDepartments(db);

  const rows = await db.department.findMany({
    where: { isActive: true },
    include: {
      director: {
        select: {
          id: true,
          name: true,
          email: true,
          title: true,
        },
      },
    },
    orderBy: [{ businessArea: 'asc' }, { name: 'asc' }],
  });

  // Calculate officer counts per department
  const userCounts = await db.user.groupBy({
    by: ['department'],
    where: { isActive: true, department: { not: null } },
    _count: { id: true },
  });
  const userCountMap = new Map<string, number>();
  userCounts.forEach((c) => {
    if (c.department) userCountMap.set(c.department, c._count.id);
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    businessArea: r.businessArea,
    directorId: r.directorId,
    director: r.director,
    isActive: r.isActive,
    officersCount: userCountMap.get(r.name) ?? (r.director ? 1 : 0),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}
