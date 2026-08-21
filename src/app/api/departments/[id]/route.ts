import { requireUser, HttpError } from '@/lib/auth';
import { assertRole } from '@/lib/authz';
import { handle, readJson, badRequest } from '@/lib/handler';
import { prisma } from '@/lib/prisma';
import { listDepartments } from '@/lib/departments.server';
import { USER_ADMIN_ROLES } from '@/lib/users';
import { assertSameOrigin, recordAuthEvent, clientIp, userAgent } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Updates a department or reassigns its designated Director.
 */
export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    assertRole(
      user,
      USER_ADMIN_ROLES,
      'Only Board Secretariat or an administrator may update departments.'
    );

    const { id } = await params;
    const dept = await prisma.department.findUnique({ where: { id } });
    if (!dept) {
      throw new HttpError(404, 'Department not found.');
    }

    const body = await readJson<{
      name?: string;
      code?: string;
      businessArea?: string;
      directorId?: string | null;
      isActive?: boolean;
    }>(req);

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) badRequest('Department name cannot be blank.');
      data.name = name;
    }

    if (body.code !== undefined) {
      data.code = body.code ? body.code.trim().toUpperCase() : null;
    }

    if (body.businessArea !== undefined) {
      const ba = body.businessArea.trim();
      if (!ba) badRequest('Business area cannot be blank.');
      data.businessArea = ba;
    }

    if (body.isActive !== undefined) {
      data.isActive = Boolean(body.isActive);
    }

    if (body.directorId !== undefined) {
      const directorId = body.directorId ? body.directorId.trim() : null;
      if (directorId) {
        const director = await prisma.user.findUnique({ where: { id: directorId } });
        if (!director || (director.role !== 'DIRECTOR' && director.role !== 'CHIEF')) {
          badRequest('Assigned officer must be a Director or Chief.');
        }
        data.directorId = directorId;

        // Synchronize director's department info
        const targetDeptName = (data.name as string) || dept.name;
        const targetBA = (data.businessArea as string) || dept.businessArea;
        await prisma.user.update({
          where: { id: directorId },
          data: { department: targetDeptName, businessArea: targetBA },
        });
      } else {
        data.directorId = null;
      }
    }

    const updated = await prisma.department.update({
      where: { id },
      data,
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
    });

    await recordAuthEvent(prisma, {
      event: 'DEPARTMENT_UPDATED',
      userId: user.id,
      ip: clientIp(req),
      userAgent: userAgent(req),
      detail: `Updated Directorate "${dept.name}" (reassigned to: ${updated.director?.name || 'Unassigned'}).`,
    });

    return {
      ok: true,
      department: updated,
      departments: await listDepartments(),
    };
  });
}

/**
 * Removes or retires a department.
 */
export async function DELETE(req: Request, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    assertRole(
      user,
      USER_ADMIN_ROLES,
      'Only Board Secretariat or an administrator may delete departments.'
    );

    const { id } = await params;
    const dept = await prisma.department.findUnique({ where: { id } });
    if (!dept) {
      throw new HttpError(404, 'Department not found.');
    }

    // Check if any active users belong to this department
    const userCount = await prisma.user.count({
      where: { department: dept.name, isActive: true },
    });
    if (userCount > 0) {
      badRequest(
        `Cannot delete "${dept.name}" because ${userCount} active officer(s) are assigned to it. Reassign them first.`
      );
    }

    await prisma.department.delete({
      where: { id },
    });

    await recordAuthEvent(prisma, {
      event: 'DEPARTMENT_DELETED',
      userId: user.id,
      ip: clientIp(req),
      userAgent: userAgent(req),
      detail: `Deleted Directorate: "${dept.name}".`,
    });

    return {
      ok: true,
      departments: await listDepartments(),
    };
  });
}
