import { createHash, randomBytes } from 'crypto';
import { prisma, type Db } from './prisma';

// ---------------------------------------------------------------- constants

/** A setup token is valid for 24 hours after it was issued. */
const TOKEN_TTL_HOURS = 24;

// ----------------------------------------------------------------- helpers

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateId(): string {
  return `stk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// --------------------------------------------------------- public interface

export interface SetupTokenUser {
  userId: string;
  name: string;
  email: string;
}

/**
 * Creates a one-time password-setup token for the given user.
 *
 * Any previously outstanding tokens for the same user are revoked first so
 * there is at most one live token at a time — exactly the same model as
 * session rotation on sign-in.
 *
 * Returns the raw 256-bit hex token for inclusion in the setup URL. Only its
 * SHA-256 hash is stored.
 */
export async function createSetupToken(db: Db, userId: string): Promise<string> {
  // Revoke any existing unused tokens for this user.
  await revokeSetupTokensForUser(db, userId);

  const token = randomBytes(32).toString('hex');
  const now = Date.now();

  await db.passwordSetupToken.create({
    data: {
      id: generateId(),
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now + TOKEN_TTL_HOURS * 3_600_000),
    },
  });

  return token;
}

/**
 * Resolves a raw token to the user it was issued for.
 *
 * Returns null if the token is unknown, expired, already used, or belongs to a
 * deactivated account — each of those is an equally opaque rejection to the
 * caller so no information leaks.
 */
export async function resolveSetupToken(token: string): Promise<SetupTokenUser | null> {
  const tokenHash = hashToken(token);
  const now = new Date();

  const record = await prisma.passwordSetupToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: { id: true, name: true, email: true, isActive: true },
      },
    },
  });

  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt <= now) return null;
  if (!record.user.isActive) return null;

  return {
    userId: record.user.id,
    name: record.user.name,
    email: record.user.email,
  };
}

/**
 * Marks a token as consumed. Called after the password has been set.
 *
 * Uses `updateMany` with the hash predicate so a concurrent call simply
 * matches zero rows rather than throwing.
 */
export async function consumeSetupToken(db: Db, token: string): Promise<void> {
  await db.passwordSetupToken.updateMany({
    where: { tokenHash: hashToken(token), usedAt: null },
    data: { usedAt: new Date() },
  });
}

/**
 * Invalidates all outstanding tokens for a user.
 *
 * Called when:
 * - A new setup token is issued (rotation)
 * - The account is deactivated
 * - A password is changed through the normal change-password flow
 */
export async function revokeSetupTokensForUser(db: Db, userId: string): Promise<void> {
  await db.passwordSetupToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
}
