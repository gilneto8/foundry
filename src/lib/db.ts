import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma 7 singleton with PrismaPg adapter.
 *
 * Lazily instantiated — the client is only created on first use, not at
 * module import time. This is critical for Docker builds where DATABASE_URL
 * is not available (and shouldn't be).
 *
 * Hot-reload safety: the singleton prevents exhausting the PostgreSQL
 * connection pool during Next.js development fast-refresh cycles.
 */

const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set.");
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

/** Lazily returns the Prisma singleton. */
export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Convenience alias — use `db` for short or `getDb()` if you prefer explicit.
 * This is a getter proxy so the client is only created on first property access.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
