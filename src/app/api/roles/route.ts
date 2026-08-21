import { requireUser } from '@/lib/auth';
import { assertRole } from '@/lib/authz';
import { handle, readJson, badRequest, conflict } from '@/lib/handler';
import { prisma } from '@/lib/prisma';
import { ALL_PERMISSION_ACTIONS } from '@/lib/roles';
import { listRoles } from '@/lib/roles.server';
import { USER_ADMIN_ROLES } from '@/lib/users';
import { assertSameOrigin, recordAuthEvent, clientIp, userAgent } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    assertRole(
      user,
      USER_ADMIN_ROLES,
      'Only Board Secretariat or an administrator may create new roles.'
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
    const permissions = Array.isArray(body.permissions) ? body.permissions : [];

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
    assertRole(
      user,
      USER_ADMIN_ROLES,
      'Only Board Secretariat or an administrator may edit role permissions.'
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
    if (Array.isArray(body.permissions)) data.permissions = body.permissions;

    const updated = await prisma.roleDefinition.update({
      where: { roleKey },
      data,
    });

    await recordAuthEvent(prisma, {
      event: 'ROLE_CONFIG_UPDATED',
      userId: user.id,
      ip: clientIp(req),
      userAgent: userAgent(req),
      detail: `Updated permissions for role: ${updated.label} (${roleKey}). Permissions: [${updated.permissions.join(', ')}].`,
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
    assertRole(
      user,
      USER_ADMIN_ROLES,
      'Only Board Secretariat or an administrator may delete roles.'
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
