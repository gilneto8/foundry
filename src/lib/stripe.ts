// ============================================================
// src/lib/stripe.ts
// Lazy Stripe client singleton.
//
// Initialized on first use, not at module load time.
// This makes it safe to import during Next.js standalone builds
// when STRIPE_SECRET_KEY is not present in the build environment.
// ============================================================

import "server-only";
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("[stripe] STRIPE_SECRET_KEY is not set.");
  }

  _stripe = new Stripe(key, {
    apiVersion: "2026-03-25.dahlia",
    typescript: true,
  });

  return _stripe;
}
