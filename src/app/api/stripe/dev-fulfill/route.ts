// ============================================================
// src/app/api/stripe/dev-fulfill/route.ts
// DEV-ONLY bypass — manually sets a user to ACTIVE.
//
// Use this during development to skip the Stripe CLI and test
// subscription-gated features without a real payment flow.
//
// BLOCKED in production: returns 404 if NODE_ENV === "production".
//
// Usage:
//   curl -X POST http://localhost:3000/api/stripe/dev-fulfill \
//     -H "Content-Type: application/json" \
//     -d '{"userId": "YOUR_USER_ID", "planKey": "PRO"}'
//
// Or hit it from Postman / REST client with the same body.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "stripe.dev-fulfill" });

export async function POST(req: NextRequest) {
  // Hard block in production — this route must never be live
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { userId, planKey = "PRO" } = await req.json();

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 days

  await db.subscription.upsert({
    where: { userId },
    update: {
      status: "ACTIVE",
      planKey,
      stripePriceId: null,
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
    },
    create: {
      userId,
      status: "ACTIVE",
      planKey,
      currentPeriodEnd,
    },
  });

  log.warn(
    { userId, planKey },
    "[DEV] Subscription manually fulfilled — do not use in production"
  );

  return NextResponse.json({
    ok: true,
    message: `User ${userId} set to ACTIVE on plan ${planKey} (dev bypass)`,
  });
}
