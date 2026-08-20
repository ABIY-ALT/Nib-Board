import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import type { Prisma } from '@/generated/prisma/client';

/**
 * A single pooled client shared across route handlers. Next.js recreates module
 * scope on each hot reload in development, which would otherwise leak a new
 * connection pool per edit, so the client is parked on globalThis.
 */
const globalForPrisma = globalThis as unknown as { __nibPrisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and point it at your Postgres instance.'
    );
  }

  // Prisma 7 has no bundled query engine: the adapter is the connection. Pool
  // settings are the pg driver's own, not Prisma's.
  const adapter = new PrismaPg({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.__nibPrisma ?? createClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.__nibPrisma = prisma;

/**
 * Anything that can run a query: the shared client, or the scoped client Prisma
 * hands to an interactive transaction.
 *
 * Repository helpers take this rather than the concrete client so the same
 * function works inside and outside a transaction. The transaction client
 * deliberately lacks `$transaction` — a nested call would not be a real nested
 * transaction, so Prisma removes it from the type.
 */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Runs `fn` inside a transaction.
 *
 * Workflow actions mutate the matter, append a workflow node, write the audit
 * event and raise notifications together — a partial write there would leave
 * the audit trail disagreeing with the record, so every state-changing route
 * goes through this.
 *
 * The timeout is raised from Prisma's 5s default: these handlers do several
 * dependent round trips, and the password-change path does Argon2 work, inside
 * the transaction.
 */
export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { maxWait: 10_000, timeout: 20_000 });
}
