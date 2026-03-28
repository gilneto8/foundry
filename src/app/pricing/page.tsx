// ============================================================
// src/app/pricing/page.tsx
// Placeholder pricing page.
//
// ⚠️  REPLACE BEFORE LAUNCH:
//   - Update plan name, price, and feature list per product
//   - If you add multiple plans, duplicate the plan card
//   - Update the planKey in handleCheckout to match your PLANS config
//   - Remove this comment block
// ============================================================

import type { Metadata } from "next";
import { PricingClient } from "./pricing-client";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Choose a plan to get started.",
};

export default function PricingPage() {
  return <PricingClient />;
}
