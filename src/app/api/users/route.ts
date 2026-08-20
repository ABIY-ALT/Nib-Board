import { requireUser } from '@/lib/auth';
import { assertRole } from '@/lib/authz';
import { handle, readJson, badRequest, conflict } from '@/lib/handler';
import { prisma, transaction } from '@/lib/prisma';
import { listUsers, listUsersForAdministration, generateId } from '@/lib/repo';
import { assertSameOrigin, clientIp, recordAuthEvent, userAgent } from '@/lib/security';
import {
  ASSIGNABLE_ROLES,
  EMAIL_PATTERN,
  USER_ADMIN_ROLES,
} from '@/lib/users';
import { Role } from '@/lib/types';
import { createSetupToken } from '@/lib/setup-token';
import { sendSetupEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The officer directory.
 *
 * Behind authentication: the roster names every officer of the bank together
 * with their role and business area, which is exactly the material a targeted
 * attacker wants and which no signed-out visitor has any reason to read. The
 * sign-in page asks for an email address rather than offering a list to pick
 * from, so nothing before authentication needs this.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();

    // `?scope=all` additionally returns deactivated accounts, each tagged with
    // its state. Restricted to the roles that can act on them, and never the
    // default — the rest of the application must only see officers who can act.
    const scope = new URL(req.url).searchParams.get('scope');
    if (scope === 'all') {
      assertRole(
        user,
        USER_ADMIN_ROLES,
        'Only an administrator or the Board Secretariat may list deactivated accounts.'
      );
      return listUsersForAdministration();
    }

    return listUsers();
  });
}

interface CreateBody {
  name?: string;
  email?: string;
  role?: string;
  title?: string;
  businessArea?: string;
  department?: string;
  phone?: string;
}

/**
 * Provisions an officer account and sends an invitation email.
 *
 * The new account is created with no password — the officer sets one by
 * clicking the setup link sent to their institutional email address. If the
 * email cannot be delivered, the entire operation is rolled back: no orphan
 * accounts with unreachable invitations.
 */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);

    const actor = await requireUser();
    assertRole(
      actor,
      USER_ADMIN_ROLES,
      'Only an administrator or the Board Secretariat may provision officer accounts.'
    );

    const body = await readJson<CreateBody>(req);
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const title = body.title?.trim();
    const businessArea = body.businessArea?.trim();
    const role = body.role as Role | undefined;

    if (!name || !email || !role || !title || !businessArea) {
      badRequest('name, email, role, title and businessArea are all required.');
    }
    const roleExists =
      ASSIGNABLE_ROLES.includes(role!) ||
      Boolean(await prisma.roleDefinition.findUnique({ where: { roleKey: role } }));
    if (!roleExists) {
      badRequest(`Unknown role '${body.role}'.`);
    }
    if (!EMAIL_PATTERN.test(email!)) {
      badRequest('Enter a valid email address.');
    }

    // Derive the base URL from the incoming request so the setup link points
    // at the right host in both development and production.
    const origin = new URL(req.url).origin;

    return transaction(async (tx) => {
      const clash = await tx.user.findFirst({
        where: { email: { equals: email!, mode: 'insensitive' } },
        select: { id: true, isActive: true },
      });
      if (clash) {
        conflict(
          clash.isActive
            ? 'An account with that email address already exists.'
            : 'A deactivated account already holds that email address. Reactivate it instead of creating a duplicate.'
        );
      }

      // Create the user with no password — they will set one via the email link.
      const created = await tx.user.create({
        data: {
          id: generateId('usr'),
          name: name!,
          email: email!,
          role: role!,
          title: title!,
          businessArea: businessArea!,
          department: body.department?.trim() || null,
          phone: body.phone?.trim() || null,
          passwordHash: null,
          mustChangePassword: true,
        },
      });

      // Generate a setup token and send the invitation email.
      const token = await createSetupToken(tx, created.id);
      const setupUrl = `${origin}/setup-password?token=${token}`;

      // If the email fails, the transaction rolls back — no orphan account.
      await sendSetupEmail(created.email, created.name, setupUrl);

      await recordAuthEvent(tx, {
        event: 'USER_CREATED',
        userId: created.id,
        emailAttempted: created.email,
        ip: clientIp(req),
        userAgent: userAgent(req),
        detail: `${created.role} account provisioned by ${actor.name} (${actor.role}); invitation email sent`,
      });

      return {
        user: {
          id: created.id,
          name: created.name,
          email: created.email,
          role: created.role as Role,
          title: created.title,
          businessArea: created.businessArea,
          department: created.department ?? undefined,
          phone: created.phone ?? undefined,
        },
        emailSent: true,
      };
    });
  });
}
