import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma 7 singleton with PrismaPg adapter.
 *
 * Prisma 7 requires a driver adapter — the connection URL is no longer
 * read automatically from the environment. The adapter is passed to the
 * PrismaClient constructor.
 *
 * Hot-reload safety: the singleton prevents exhausting the PostgreSQL
 * connection pool during Next.js development fast-refresh cycles.
 */

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient() {
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

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
