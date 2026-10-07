import { prisma, type Db } from './prisma';
import { HttpError } from './auth';
import { ensureDefaultRoles } from './roles.server';
import { hasPermission, PERMISSIONS, type PermissionKey } from './permissions';
import type { User } from './types';

/**
 * Server-side permission resolution.
 *
 * The permissions a caller holds are read from the role definition their role
 * points at, on every request. They are never taken from the session, the
 * request body or anything else the browser can influence: hiding a button is a
 * courtesy, and this is the control. An administrator revoking a permission
 * takes effect on the caller's next request rather than on their next sign-in.
 */

/**
 * Every permission granted to this user's role, or an empty list.
 *
 * Fails closed in both directions that can go wrong: a role with no definition
 * row — a role key that was deleted, or one never seeded — yields no
 * permissions rather than all of them.
 */
export async function getPermissions(user: Pick<User, 'role'>, db: Db = prisma): Promise<string[]> {
  const definition = await db.roleDefinition.findUnique({
    where: { roleKey: user.role },
    select: { permissions: true },
  });
  if (definition) return definition.permissions;

  // A fresh database has no role definitions until something asks for them.
  // Seed the defaults once and look again, so the first request after a deploy
  // is not refused for want of a row the application creates itself.
  await ensureDefaultRoles(db);
  const seeded = await db.roleDefinition.findUnique({
    where: { roleKey: user.role },
    select: { permissions: true },
  });
  return seeded?.permissions ?? [];
}

export async function can(user: User, permission: PermissionKey, db: Db = prisma): Promise<boolean> {
  return hasPermission(await getPermissions(user, db), permission);
}

/**
 * Refuses the request unless the caller's role carries the permission.
 *
 * Every endpoint that acts on a permission calls this before doing anything
 * else, so an officer who reaches the API directly is stopped by the same rule
 * that decided whether to draw the button.
 */
export async function assertPermission(
  user: User,
  permission: PermissionKey,
  message: string,
  db: Db = prisma
): Promise<void> {
  if (!(await can(user, permission, db))) {
    throw new HttpError(403, message);
  }
}

/** The permissions without which nobody could repair the configuration. */
const LIFELINE: ReadonlyArray<{ key: PermissionKey; task: string }> = [
  { key: PERMISSIONS.CONFIGURE_SETTINGS, task: 'change roles and permissions' },
  { key: PERMISSIONS.ADMINISTER_USERS, task: 'administer officer accounts' },
];

/**
 * Refuses a change that would leave no active officer holding a lifeline
 * permission.
 *
 * With the matrix enforced, unticking `configure_settings` from the last role
 * that holds it — or deactivating or re-roling the last officer in such a role
 * — would lock everyone out of the screen that could undo it, leaving the
 * database as the only way back. Call it inside the transaction, after the
 * write, so the check sees the result and a refusal rolls the write back.
 */
export async function assertAdministrationReachable(db: Db): Promise<void> {
  for (const { key, task } of LIFELINE) {
    const roles = await db.roleDefinition.findMany({
      where: { permissions: { has: key } },
      select: { roleKey: true },
    });
    const holders =
      roles.length === 0
        ? 0
        : await db.user.count({
            where: { isActive: true, role: { in: roles.map((r) => r.roleKey) } },
          });
    if (holders === 0) {
      throw new HttpError(
        409,
        `This change would leave no active officer able to ${task}. Grant '${key}' to another role that has an active officer first.`
      );
    }
  }
}
