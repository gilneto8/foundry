// ============================================================
// src/app/api/stripe/create-portal-session/route.ts
// Creates a Stripe Customer Portal session.
//
// POST /api/stripe/create-portal-session
// Returns: { url: string }
//
// The portal lets users manage their subscription (cancel,
// change plan, update payment method) on Stripe's hosted page.
// ============================================================

import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { verifySession } from "@/lib/session";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "stripe.portal" });

export async function POST() {
  try {
    const session = await verifySession();

    const subscription = await db.subscription.findUnique({
      where: { userId: session.userId },
      select: { stripeCustomerId: true },
    });

    if (!subscription?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No Stripe customer found for this user." },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${appUrl}/dashboard`,
    });

    log.info({ userId: session.userId }, "Customer portal session created");
    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    log.error({ err }, "Failed to create portal session");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
