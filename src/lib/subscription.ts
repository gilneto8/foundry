// ============================================================
// src/lib/subscription.ts
// Stripe plan config + verifySubscription() utility.
//
// PLANS is the single source of truth for billing tiers.
// Each key maps to a STRIPE_PRICE_ID_<KEY> env var.
//
// verifySubscription() works the same way as verifySession():
// call it in a Server Component or Server Action to ensure the
// user has an active subscription. It redirects to /pricing if not.
//
// It is intentionally NOT wired to any route in the boilerplate —
// apply it where your product requires it after cloning.
// ============================================================

import "server-only";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import type { Subscription } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Plan registry
// ---------------------------------------------------------------------------
// To add a new tier:
//   1. Add STRIPE_PRICE_ID_<KEY>="price_..." to .env
//   2. Create the price in your Stripe dashboard and paste the ID
//   3. Uncomment (or add) the entry below
//   4. Add a plan card to src/app/pricing/page.tsx
// ---------------------------------------------------------------------------
export const PLANS = {
  PRO: {
    key: "PRO" as const,
    label: "Pro",
    priceId: process.env.STRIPE_PRICE_ID_PRO,
    // Add: monthlyPrice, annualPrice, features[], etc. per product
  },
  // BUSINESS: {
  //   key: "BUSINESS" as const,
  //   label: "Business",
  //   priceId: process.env.STRIPE_PRICE_ID_BUSINESS,
  // },
} as const;

export type PlanKey = keyof typeof PLANS;
export type Plan = (typeof PLANS)[PlanKey];

// ---------------------------------------------------------------------------
// getSubscription — fetch the subscription record for a user.
// Returns null if no subscription row exists.
// ---------------------------------------------------------------------------
export async function getSubscription(
  userId: string
): Promise<Subscription | null> {
  return db.subscription.findUnique({ where: { userId } });
}

// ---------------------------------------------------------------------------
// verifySubscription
// Fetches the subscription for the given userId.
// Redirects to /pricing if the subscription is missing or not ACTIVE.
//
// Usage (Server Component or Server Action):
//   const subscription = await verifySubscription(session.userId);
// ---------------------------------------------------------------------------
export async function verifySubscription(
  userId: string
): Promise<Subscription> {
  const subscription = await getSubscription(userId);

  if (!subscription || subscription.status !== "ACTIVE") {
    redirect("/pricing");
  }

  return subscription;
}
