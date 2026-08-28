import { PrismaClient } from "@prisma/client";

// The Prisma schema/migrations are owned by apps/api (apps/api/prisma/schema.prisma).
// apps/worker doesn't have its own schema — it just imports the same generated
// @prisma/client (npm workspaces hoist it to the root node_modules, so both
// packages resolve to the identical generated client) and points its own
// PrismaClient at the same DATABASE_URL from the shared root .env.
//
// Mirrors the singleton pattern in apps/api/src/lib/db.ts so hot reload
// doesn't exhaust the Postgres connection pool by creating a new client on
// every reload.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
