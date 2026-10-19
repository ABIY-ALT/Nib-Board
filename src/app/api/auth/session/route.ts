import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPrincipal, HttpError } from '@/lib/auth';
import { handle, readJson } from '@/lib/handler';
import { prisma, transaction } from '@/lib/prisma';
import {
  createSession,
  passwordChangeEnforced,
  revokeSession,
  REVOKED,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from '@/lib/session';
import { csrfTokenFor, currentCsrfToken, issuePresessionCsrfToken } from '@/lib/csrf.server';
import {
  verifyPassword,
  MAX_PASSWORD_INPUT_LENGTH,
  MAX_PASSWORD_REQUEST_BYTES,
} from '@/lib/password';
import {
  assertLoginRateLimit,
  assertSameOrigin,
  clientIp,
  recordAuthEvent,
  userAgent,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MINUTES,
} from '@/lib/security';
import { getPermissions } from '@/lib/permissions.server';
import { Role } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RFC 5321 caps a mailbox address at 254 characters. */
const MAX_EMAIL_LENGTH = 254;

/**
 * Who am I? Returns null rather than 401 so the login page can render.
 *
 * The permission set travels with the identity so the interface can leave out
 * what the caller cannot do. It is a courtesy, not a control: every endpoint
 * re-reads the permissions from the role definition on its own, so a client
 * that keeps a stale list, or invents one, gets nowhere.
 *
 * The anti-CSRF token for this browser travels with it too, so the page needs
 * no second round trip before its first state-changing request.
 */
export async function GET() {
  const principal = await getPrincipal();
  return NextResponse.json({
    user: principal?.user ?? null,
    mustChangePassword: principal?.mustChangePassword ?? false,
    permissions: principal ? await getPermissions(principal.user) : [],
    csrfToken: await currentCsrfToken(),
  });
}

/**
 * Signs in with email and password.
 *
 * Failures are deliberately indistinguishable to the caller: an unknown
 * address, a wrong password and an account without a credential all return the
 * same message and all pay the same Argon2 cost, so the response cannot be used
 * to enumerate who banks here. The reason is recorded server-side instead.
 */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);

    const { email, password } = await readJson<{ email?: unknown; password?: unknown }>(req, {
      maxBytes: MAX_PASSWORD_REQUEST_BYTES,
    });
    const ip = clientIp(req);
    const ua = userAgent(req);

    // Shape is checked before anything touches the database or Argon2: a
    // non-string would otherwise surface as a 500, and an unbounded password
    // is CPU and memory spent on hashing input no account can have.
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email ||
      !password ||
      email.length > MAX_EMAIL_LENGTH ||
      password.length > MAX_PASSWORD_INPUT_LENGTH
    ) {
      throw new HttpError(400, 'Email and password are required.');
    }

    await assertLoginRateLimit(ip);

    const GENERIC_FAILURE = 'Invalid email address or password.';

    /**
     * The transaction reports the outcome rather than throwing it.
     *
     * Failure bookkeeping — the attempt counter, the lockout stamp and the
     * auth_events rows — must survive a rejected sign-in. Throwing from inside
     * the transaction would roll all of it back, silently disabling both
     * account lockout and the rate limiter that counts recorded failures.
     */
    type Outcome =
      | { ok: true; body: unknown }
      | { ok: false; status: number; message: string };

    const outcome = await transaction<Outcome>(async (tx) => {
      const account = await tx.user.findFirst({
        where: { email: { equals: email.trim(), mode: 'insensitive' }, isActive: true },
      });

      if (account?.lockedUntil && account.lockedUntil > new Date()) {
        await recordAuthEvent(tx, {
          event: 'LOGIN_BLOCKED_LOCKED',
          userId: account.id,
          emailAttempted: email,
          ip,
          userAgent: ua,
        });
        return {
          ok: false,
          status: 423,
          message: `This account is temporarily locked after repeated failed sign-in attempts. Try again in ${LOCKOUT_MINUTES} minutes.`,
        };
      }

      // Verify even when the account does not exist, against a dummy hash, so
      // both paths take the same time and cannot be told apart by timing.
      const DUMMY_HASH =
        '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$3B1YQ0RhVYbUw8hkFyBLBhBqTUKPqCJcVJ9lp2nEWXo';
      const ok = await verifyPassword(password, account?.passwordHash ?? DUMMY_HASH);

      if (!account || !ok) {
        if (account) {
          // Incremented atomically rather than read-then-written, so two
          // simultaneous guesses cannot each read "2" and both write "3".
          const { failedLoginAttempts: attempts } = await tx.user.update({
            where: { id: account.id },
            data: { failedLoginAttempts: { increment: 1 } },
            select: { failedLoginAttempts: true },
          });

          const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
          if (shouldLock) {
            await tx.user.update({
              where: { id: account.id },
              data: { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) },
            });
          }

          await recordAuthEvent(tx, {
            event: 'LOGIN_FAILED',
            userId: account.id,
            emailAttempted: email,
            ip,
            userAgent: ua,
            detail: `Failed attempt ${attempts} of ${MAX_FAILED_ATTEMPTS}`,
          });
          if (shouldLock) {
            await recordAuthEvent(tx, {
              event: 'ACCOUNT_LOCKED',
              userId: account.id,
              emailAttempted: email,
              ip,
              userAgent: ua,
              detail: `Locked for ${LOCKOUT_MINUTES} minutes`,
            });
          }
        } else {
          await recordAuthEvent(tx, {
            event: 'LOGIN_FAILED',
            emailAttempted: email,
            ip,
            userAgent: ua,
            detail: 'No such active account',
          });
        }
        return { ok: false, status: 401, message: GENERIC_FAILURE };
      }

      await tx.user.update({
        where: { id: account.id },
        data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      });

      const { token, superseded } = await createSession(tx, account.id, { ip, userAgent: ua });

      // One open session per account: a sign-in that ended another one is
      // recorded, so the account holder can see it under Account security and
      // the security team can see it in the audit trail. Written before the
      // sign-in itself so the sign-in reads as the newer of the two.
      if (superseded > 0) {
        await recordAuthEvent(tx, {
          event: 'SESSION_REVOKED',
          userId: account.id,
          emailAttempted: email,
          ip,
          userAgent: ua,
          detail: 'The session already open on this account was ended by a new sign-in',
        });
      }

      await recordAuthEvent(tx, {
        event: 'LOGIN_SUCCEEDED',
        userId: account.id,
        emailAttempted: email,
        ip,
        userAgent: ua,
      });

      const store = await cookies();
      store.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);

      const signedIn = {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role as Role,
        title: account.title,
        businessArea: account.businessArea,
        department: account.department ?? undefined,
        phone: account.phone ?? undefined,
      };

      return {
        ok: true,
        body: {
          user: signedIn,
          mustChangePassword: passwordChangeEnforced(account.role, account.mustChangePassword),
          permissions: await getPermissions(signedIn, tx),
          // The token is bound to the session, so a new session needs a new one.
          csrfToken: csrfTokenFor(token),
        },
      };
    });

    // Raised only after the transaction has committed, so the failure record
    // and any lockout it triggered are durable.
    if (!outcome.ok) {
      throw new HttpError(outcome.status, outcome.message);
    }
    return outcome.body;
  });
}

/** Signs out, revoking the session server-side rather than only clearing the cookie. */
export async function DELETE(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);

    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    const principal = await getPrincipal();

    await revokeSession(token, REVOKED.SIGNED_OUT);
    await recordAuthEvent(prisma, {
      event: 'LOGOUT',
      userId: principal?.user.id ?? null,
      ip: clientIp(req),
      userAgent: userAgent(req),
    });

    store.delete(SESSION_COOKIE);
    // The sign-in form that follows needs a token that does not depend on
    // the session just ended.
    return { ok: true, csrfToken: await issuePresessionCsrfToken() };
  });
}
