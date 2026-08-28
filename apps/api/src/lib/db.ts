import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient instance across hot reloads in dev so we don't
// exhaust the Postgres connection pool by creating a new client on every reload.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
