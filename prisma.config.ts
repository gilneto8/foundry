import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 configuration.
 * Connection URLs live here, not in schema.prisma.
 * See: https://pris.ly/d/config-datasource
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL as string,
  },
});
