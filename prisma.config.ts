// Prisma 7 reads its configuration from here rather than from the schema, and
// no longer loads .env on its own — hence the explicit dotenv import.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Run by `prisma db seed`, and automatically after `prisma migrate reset`.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
