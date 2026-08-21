import { requireUser } from '@/lib/auth';
import { assertRole } from '@/lib/authz';
import { handle, readJson, badRequest, conflict } from '@/lib/handler';
import { prisma } from '@/lib/prisma';
import { listDepartments } from '@/lib/departments.server';
import { USER_ADMIN_ROLES } from '@/lib/users';
import { assertSameOrigin, recordAuthEvent, clientIp, userAgent } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    await requireUser();
    const departments = await listDepartments();
    return { departments };
  });
}

/**
 * Creates a new department or directorate and assigns a designated Director.
 */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    assertRole(
      user,
      USER_ADMIN_ROLES,
      'Only Board Secretariat or an administrator may create departments.'
    );

    const body = await readJson<{
      name?: string;
      code?: string;
      businessArea?: string;
      directorId?: string | null;
    }>(req);

    const name = (body.name || '').trim();
    const code = (body.code || '').trim().toUpperCase() || null;
    const businessArea = (body.businessArea || '').trim();
    const directorId = body.directorId?.trim() || null;

    if (!name || !businessArea) {
      badRequest('Department name and Business Area are required.');
    }

    const existing = await prisma.department.findUnique({
      where: { name },
    });
    if (existing) {
      conflict(`A department named '${name}' already exists.`);
    }

    if (directorId) {
      const director = await prisma.user.findUnique({
        where: { id: directorId },
      });
      if (!director || (director.role !== 'DIRECTOR' && director.role !== 'CHIEF')) {
        badRequest('Assigned officer must have the role of Director.');
      }
    }

    const deptId = `dept_${name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20)}_${Date.now().toString(36)}`;

    const created = await prisma.department.create({
      data: {
        id: deptId,
        name,
        code,
        businessArea,
        directorId,
        isActive: true,
      },
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

    // If a Director was assigned, synchronize the Director's department field
    if (directorId) {
      await prisma.user.update({
        where: { id: directorId },
        data: { department: name, businessArea },
      });
    }

    await recordAuthEvent(prisma, {
      event: 'DEPARTMENT_CREATED',
      userId: user.id,
      ip: clientIp(req),
      userAgent: userAgent(req),
      detail: `Created new Directorate: "${name}" (${businessArea})${directorId ? ` with designated Director assigned` : ''}.`,
    });

    return {
      ok: true,
      department: created,
      departments: await listDepartments(),
    };
  });
}
