// ============================================================
// worker/src/db.ts
// Prisma client for the worker process.
//
// Uses the "prisma-client-js" (legacy) generator output at
// ./generated/prisma-cjs — this produces compiled .js files
// compatible with plain Node.js require() (no bundler needed).
//
// The TypeScript-first "prisma-client" generator at
// src/generated/prisma is for Next.js only (uses import.meta.url
// and ESM syntax that requires a bundler to consume).
//
// DATABASE_URL must be set in the environment.
// @prisma/adapter-pg and pg are installed in worker/package.json.
// ============================================================

import { PrismaClient } from "./generated/prisma-cjs";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("[worker/db] DATABASE_URL is not set.");
}

const adapter = new PrismaPg({ connectionString });

export const db = new PrismaClient({ adapter });
