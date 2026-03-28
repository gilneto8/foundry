// ============================================================
// src/app/api/stripe/create-checkout-session/route.ts
// Creates a Stripe Hosted Checkout session for the given plan.
//
// POST /api/stripe/create-checkout-session
// Body: { planKey: "PRO" }
// Returns: { url: string }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { PLANS, type PlanKey } from "@/lib/subscription";
import { verifySession } from "@/lib/session";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "stripe.checkout" });

export async function POST(req: NextRequest) {
  try {
    const session = await verifySession();
    const { planKey = "PRO" }: { planKey?: PlanKey } = await req.json();

    const plan = PLANS[planKey];
    if (!plan?.priceId) {
      return NextResponse.json(
        { error: `Plan "${planKey}" is not configured. Set STRIPE_PRICE_ID_${planKey} in your .env.` },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // Upsert Stripe Customer — reuse if one already exists for this user
    let stripeCustomerId: string | undefined;
    const existing = await db.subscription.findUnique({
      where: { userId: session.userId },
      select: { stripeCustomerId: true },
    });
    stripeCustomerId = existing?.stripeCustomerId ?? undefined;

    if (!stripeCustomerId) {
      const user = await db.user.findUnique({
        where: { id: session.userId },
        select: { email: true, name: true },
      });
      const customer = await stripe.customers.create({
        email: user?.email,
        name: user?.name ?? undefined,
        metadata: { userId: session.userId },
      });
      stripeCustomerId = customer.id;
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?checkout=success`,
      cancel_url: `${appUrl}/pricing?checkout=cancelled`,
      metadata: { userId: session.userId, planKey },
      subscription_data: {
        metadata: { userId: session.userId, planKey },
      },
    });

    log.info({ userId: session.userId, planKey }, "Checkout session created");
    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    log.error({ err }, "Failed to create checkout session");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
