import { requireUser } from '@/lib/auth';
import { handle, readJson, badRequest, conflict } from '@/lib/handler';
import { prisma, transaction } from '@/lib/prisma';
import { ALL_PERMISSION_ACTIONS } from '@/lib/roles';
import { listRoles } from '@/lib/roles.server';
import { assertSameOrigin, recordAuthEvent, clientIp, userAgent } from '@/lib/security';
import { assertAdministrationReachable, assertPermission } from '@/lib/permissions.server';
import { PERMISSIONS } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KNOWN_PERMISSIONS = new Set(ALL_PERMISSION_ACTIONS.map((a) => a.key));

/**
 * A submitted permission list, refused unless every entry is a permission the
 * system defines. Keys a role already holds are tolerated, so a definition
 * carrying a since-retired key can still be saved from the matrix, which sends
 * the whole list back. Anything else used to be stored verbatim — or, for a
 * non-string, fail as a 500.
 */
function parsePermissions(value: unknown, alreadyHeld: readonly string[] = []): string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    !value.every((p) => typeof p === 'string' && (KNOWN_PERMISSIONS.has(p) || alreadyHeld.includes(p)))
  ) {
    badRequest('permissions must be a list of permission keys defined by the system.');
  }
  return [...new Set(value as string[])];
}

export async function GET() {
  return handle(async () => {
    await requireUser();
    const roles = await listRoles();
    return {
      roles,
      availablePermissions: ALL_PERMISSION_ACTIONS,
    };
  });
}

/**
 * Creates a new custom role.
 */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    await assertPermission(
      user,
      PERMISSIONS.CONFIGURE_SETTINGS,
      'Access Denied: your role does not hold the "Governance Settings & Classifications" permission.'
    );

    const body = await readJson<{
      roleKey?: string;
      label?: string;
      description?: string;
      permissions?: string[];
    }>(req);

    const rawKey = (body.roleKey || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const label = (body.label || '').trim();
    const description = (body.description || '').trim();
    const permissions = parsePermissions(body.permissions) ?? [];

    if (!rawKey || !label) {
      badRequest('Role code and display label are required.');
    }

    const existing = await prisma.roleDefinition.findUnique({
      where: { roleKey: rawKey },
    });
    if (existing) {
      conflict(`A role with code '${rawKey}' already exists.`);
    }

    const created = await prisma.roleDefinition.create({
      data: {
        id: `role_${rawKey.toLowerCase()}_${Date.now().toString(36)}`,
        roleKey: rawKey,
        label,
        description,
        isSystem: false,
        permissions,
      },
    });

    await recordAuthEvent(prisma, {
      event: 'ROLE_CONFIG_UPDATED',
      userId: user.id,
      ip: clientIp(req),
      userAgent: userAgent(req),
      detail: `Created new custom role: ${label} (${rawKey}) with ${permissions.length} permissions.`,
    });

    return {
      ok: true,
      role: created,
      roles: await listRoles(),
    };
  });
}

/**
 * Updates permissions and label for a role.
 */
export async function PATCH(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    await assertPermission(
      user,
      PERMISSIONS.CONFIGURE_SETTINGS,
      'Access Denied: your role does not hold the "Governance Settings & Classifications" permission.'
    );

    const body = await readJson<{
      roleKey?: string;
      label?: string;
      description?: string;
      permissions?: string[];
    }>(req);

    const roleKey = (body.roleKey || '').trim();
    if (!roleKey) {
      badRequest('Role key is required.');
    }

    const existing = await prisma.roleDefinition.findUnique({
      where: { roleKey },
    });
    if (!existing) {
      badRequest(`Role '${roleKey}' does not exist.`);
    }

    const data: Record<string, unknown> = {};
    if (body.label !== undefined) data.label = body.label.trim();
    if (body.description !== undefined) data.description = body.description.trim();
    const permissions = parsePermissions(body.permissions, existing!.permissions);
    if (permissions) data.permissions = permissions;

    // The matrix is enforced, so a change here takes effect on the next request
    // of everyone holding the role. The record names what was granted and
    // revoked, not just the resulting list, and the change is refused if it
    // would leave nobody able to administer the system.
    const before = existing!.permissions;
    const updated = await transaction(async (tx) => {
      const row = await tx.roleDefinition.update({
        where: { roleKey },
        data,
      });
      await assertAdministrationReachable(tx);

      const granted = row.permissions.filter((p) => !before.includes(p));
      const revoked = before.filter((p) => !row.permissions.includes(p));
      await recordAuthEvent(tx, {
        event: 'ROLE_CONFIG_UPDATED',
        userId: user.id,
        ip: clientIp(req),
        userAgent: userAgent(req),
        detail:
          `Updated permissions for role: ${row.label} (${roleKey}). ` +
          `Granted: [${granted.join(', ')}]. Revoked: [${revoked.join(', ')}]. ` +
          `Now: [${row.permissions.join(', ')}].`,
      });
      return row;
    });

    return {
      ok: true,
      role: updated,
      roles: await listRoles(),
    };
  });
}

/**
 * Deletes a custom role (system roles cannot be deleted).
 */
export async function DELETE(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    await assertPermission(
      user,
      PERMISSIONS.CONFIGURE_SETTINGS,
      'Access Denied: your role does not hold the "Governance Settings & Classifications" permission.'
    );

    const body = await readJson<{ roleKey?: string }>(req);
    const roleKey = (body.roleKey || '').trim();
    if (!roleKey) {
      badRequest('Role key is required.');
    }

    const existing = await prisma.roleDefinition.findUnique({
      where: { roleKey },
    });
    if (!existing) {
      badRequest(`Role '${roleKey}' does not exist.`);
    }
    if (existing.isSystem) {
      badRequest('System roles cannot be deleted.');
    }

    // Check if any users currently hold this role
    const usersWithRole = await prisma.user.count({
      where: { role: roleKey },
    });
    if (usersWithRole > 0) {
      conflict(`Cannot delete role '${roleKey}': ${usersWithRole} user(s) currently hold this role.`);
    }

    await prisma.roleDefinition.delete({
      where: { roleKey },
    });

    await recordAuthEvent(prisma, {
      event: 'ROLE_CONFIG_UPDATED',
      userId: user.id,
      ip: clientIp(req),
      userAgent: userAgent(req),
      detail: `Deleted custom role: ${existing.label} (${roleKey}).`,
    });

    return {
      ok: true,
      roles: await listRoles(),
    };
  });
}
