// ============================================================
// prisma/seed.ts
// Database seed — creates the default ADMIN user.
//
// Run with:
//   npx prisma db seed
//
// Or directly:
//   npx tsx prisma/seed.ts
//
// IMPORTANT: This seed is IDEMPOTENT — safe to run multiple times.
// It uses upsert, so re-running will NOT create duplicate users.
//
// CREDENTIALS (change before production):
//   Email:    admin@foundry.local
//   Password: admin123
//
// The admin user has role=ADMIN and can access:
//   - /admin           → Admin panel
//   - /admin/queues    → Bull Board (all BullMQ queues + email DLQ)
// ============================================================

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const adapter = new PrismaPg({ connectionString });
const db = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@foundry.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin123";

  const passwordHash = await argon2.hash(password);

  const admin = await db.user.upsert({
    where: { email },
    update: {
      // Keep password in sync if re-seeding with a new SEED_ADMIN_PASSWORD
      passwordHash,
      role: "ADMIN",
    },
    create: {
      email,
      name: "Admin",
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log(`✅ Admin user ready:`);
  console.log(`   Email:    ${admin.email}`);
  console.log(`   Role:     ${admin.role}`);
  console.log(`   Password: ${password}`);
  console.log(`   ID:       ${admin.id}`);
  console.log();
  console.log(`   Access admin panel at: /admin`);
  console.log(`   Access queue UI at:    /admin/queues`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
