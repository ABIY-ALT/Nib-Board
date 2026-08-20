import { requireUser, HttpError } from '@/lib/auth';
import { assertRole } from '@/lib/authz';
import { handle, readJson, badRequest, conflict } from '@/lib/handler';
import { transaction } from '@/lib/prisma';
import { revokeAllSessionsForUser } from '@/lib/session';
import { assertSameOrigin, clientIp, recordAuthEvent, userAgent } from '@/lib/security';
import {
  ASSIGNABLE_ROLES,
  EMAIL_PATTERN,
  USER_ADMIN_ROLES,
} from '@/lib/users';
import { Role } from '@/lib/types';
import { createSetupToken, revokeSetupTokensForUser } from '@/lib/setup-token';
import { sendPasswordResetEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

interface PatchBody {
  name?: string;
  email?: string;
  role?: string;
  title?: string;
  businessArea?: string;
  department?: string | null;
  phone?: string | null;
  isActive?: boolean;
  /** Send a password-reset email with a one-time setup link. */
  resetPassword?: boolean;
  /** Clear a lockout without waiting it out. */
  unlock?: boolean;
}

/**
 * Amends an officer account.
 *
 * Everything an administrator can do to an account other than create it goes
 * through here — correcting a name, moving someone between roles, resetting a
 * credential, clearing a lockout, deactivating and reactivating. Each of those
 * is written to the append-only security record, so the history says who
 * changed what rather than only who signed in.
 */
export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);

    const actor = await requireUser();
    assertRole(
      actor,
      USER_ADMIN_ROLES,
      'Only an administrator or the Board Secretariat may administer officer accounts.'
    );

    const { id } = await params;
    const body = await readJson<PatchBody>(req);

    return transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new HttpError(404, 'Officer account not found.');

      const ip = clientIp(req);
      const ua = userAgent(req);
      const changes: string[] = [];
      const data: Record<string, unknown> = {};

      if (body.name !== undefined) {
        const name = body.name.trim();
        if (!name) badRequest('Name cannot be blank.');
        if (name !== target.name) changes.push(`name "${target.name}" → "${name}"`);
        data.name = name;
      }

      if (body.email !== undefined) {
        const email = body.email.trim().toLowerCase();
        if (!EMAIL_PATTERN.test(email)) badRequest('Enter a valid email address.');
        if (email !== target.email) {
          const clash = await tx.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' }, id: { not: id } },
            select: { id: true },
          });
          if (clash) conflict('Another account already uses that email address.');
          changes.push(`email ${target.email} → ${email}`);
        }
        data.email = email;
      }

      if (body.role !== undefined) {
        const validRole =
          ASSIGNABLE_ROLES.includes(body.role as Role) ||
          Boolean(await tx.roleDefinition.findUnique({ where: { roleKey: body.role } }));
        if (!validRole) {
          badRequest(`Unknown role '${body.role}'.`);
        }
        // A role change rewrites what this person can see and do, so it must not
        // be applied to a live session that was authorized under the old role.
        if (body.role !== target.role) changes.push(`role ${target.role} → ${body.role}`);
        data.role = body.role;
      }

      for (const field of ['title', 'businessArea'] as const) {
        if (body[field] !== undefined) {
          const value = body[field]!.trim();
          if (!value) badRequest(`${field} cannot be blank.`);
          if (value !== target[field]) changes.push(`${field} changed`);
          data[field] = value;
        }
      }

      if (body.department !== undefined) data.department = body.department?.trim() || null;
      if (body.phone !== undefined) data.phone = body.phone?.trim() || null;

      if (body.unlock) {
        data.lockedUntil = null;
        data.failedLoginAttempts = 0;
        changes.push('lockout cleared');
      }

      // Deactivation is a soft delete, deliberately. Every matter, audit row and
      // workflow node references the officer who acted; removing the row would
      // either break those references or erase the record of who did what.
      let activation: 'USER_DEACTIVATED' | 'USER_REACTIVATED' | null = null;
      if (body.isActive !== undefined && body.isActive !== target.isActive) {
        if (!body.isActive && target.id === actor.id) {
          badRequest('You cannot deactivate the account you are signed in with.');
        }
        data.isActive = body.isActive;
        activation = body.isActive ? 'USER_REACTIVATED' : 'USER_DEACTIVATED';
      }

      let passwordReset = false;
      if (body.resetPassword) {
        // Clear the password so the officer must use the setup link. The
        // mustChangePassword flag stays true as an extra safety net.
        data.passwordHash = null;
        data.mustChangePassword = true;
        data.passwordChangedAt = null;
        data.failedLoginAttempts = 0;
        data.lockedUntil = null;
        passwordReset = true;
      }

      if (Object.keys(data).length === 0) {
        badRequest('No changes were supplied.');
      }

      const updated = await tx.user.update({ where: { id }, data });

      // A deactivation, a role change or a credential reset must not leave the
      // old session working: each of them changes what that session should be
      // allowed to do, and a session is only re-authorized when it is created.
      const mustSignOut =
        activation === 'USER_DEACTIVATED' || passwordReset || data.role !== undefined;
      if (mustSignOut) {
        await revokeAllSessionsForUser(
          tx,
          id,
          passwordReset ? 'password reset by administrator' : 'account changed by administrator'
        );
      }

      if (activation) {
        await recordAuthEvent(tx, {
          event: activation,
          userId: id,
          emailAttempted: updated.email,
          ip,
          userAgent: ua,
          detail: `By ${actor.name} (${actor.role})`,
        });
      }
      if (passwordReset) {
        // Revoke any existing setup tokens and issue a new one.
        await revokeSetupTokensForUser(tx, id);
        const token = await createSetupToken(tx, id);
        const origin = new URL(req.url).origin;
        const setupUrl = `${origin}/setup-password?token=${token}`;

        // Send the password-reset email. If it fails, the entire
        // transaction rolls back — no orphan token without delivery.
        await sendPasswordResetEmail(updated.email, updated.name, setupUrl);

        await recordAuthEvent(tx, {
          event: 'PASSWORD_RESET',
          userId: id,
          emailAttempted: updated.email,
          ip,
          userAgent: ua,
          detail: `Password reset email sent by ${actor.name} (${actor.role})`,
        });
      }
      if (body.unlock) {
        await recordAuthEvent(tx, {
          event: 'ACCOUNT_UNLOCKED',
          userId: id,
          emailAttempted: updated.email,
          ip,
          userAgent: ua,
          detail: `By ${actor.name} (${actor.role})`,
        });
      }
      if (changes.length) {
        await recordAuthEvent(tx, {
          event: 'USER_UPDATED',
          userId: id,
          emailAttempted: updated.email,
          ip,
          userAgent: ua,
          detail: `${changes.join('; ')} — by ${actor.name} (${actor.role})`,
        });
      }

      return {
        user: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          role: updated.role as Role,
          title: updated.title,
          businessArea: updated.businessArea,
          department: updated.department ?? undefined,
          phone: updated.phone ?? undefined,
        },
        isActive: updated.isActive,
        emailSent: passwordReset,
        signedOut: mustSignOut,
      };
    });
  });
}

/**
 * Deactivates an account.
 *
 * Never a row deletion: the officer is referenced by every matter they touched
 * and by the audit trail, which is append-only by design. This is a convenience
 * alias for `PATCH { isActive: false }`.
 */
export async function DELETE(req: Request, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);

    const actor = await requireUser();
    assertRole(
      actor,
      USER_ADMIN_ROLES,
      'Only an administrator or the Board Secretariat may administer officer accounts.'
    );

    const { id } = await params;
    if (id === actor.id) {
      badRequest('You cannot deactivate the account you are signed in with.');
    }

    return transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id }, select: { email: true, isActive: true } });
      if (!target) throw new HttpError(404, 'Officer account not found.');
      if (!target.isActive) return { ok: true, alreadyInactive: true };

      await tx.user.update({ where: { id }, data: { isActive: false } });
      await revokeAllSessionsForUser(tx, id, 'account deactivated');
      await recordAuthEvent(tx, {
        event: 'USER_DEACTIVATED',
        userId: id,
        emailAttempted: target.email,
        ip: clientIp(req),
        userAgent: userAgent(req),
        detail: `By ${actor.name} (${actor.role})`,
      });

      return { ok: true };
    });
  });
}
