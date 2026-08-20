import { prisma, type Db } from './prisma';
import { AppRole, DEFAULT_SYSTEM_ROLES } from './roles';

/**
 * Ensures system default roles exist in the database.
 */
export async function ensureDefaultRoles(db: Db = prisma): Promise<void> {
  for (const r of DEFAULT_SYSTEM_ROLES) {
    await db.roleDefinition.upsert({
      where: { roleKey: r.roleKey },
      create: {
        id: `role_${r.roleKey.toLowerCase()}`,
        roleKey: r.roleKey,
        label: r.label,
        description: r.description,
        isSystem: true,
        permissions: r.permissions,
      },
      update: {},
    });
  }
}

/**
 * Returns all active roles and their permission sets.
 */
export async function listRoles(db: Db = prisma): Promise<AppRole[]> {
  await ensureDefaultRoles(db);
  const rows = await db.roleDefinition.findMany({
    orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    roleKey: r.roleKey,
    label: r.label,
    description: r.description,
    isSystem: r.isSystem,
    permissions: r.permissions,
  }));
}
