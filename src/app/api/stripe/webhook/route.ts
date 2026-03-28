// ============================================================
// src/app/api/stripe/webhook/route.ts
// Stripe webhook receiver.
//
// IMPORTANT: Signature verification happens HERE — before enqueue.
// The raw Buffer must be used, not the parsed JSON body.
//
// Event processing is intentionally async via BullMQ:
//   1. Verify signature → return 200 immediately
//   2. Enqueue event → worker processes it
//
// This keeps response time under 100ms so Stripe doesn't retry.
// The worker uses event.id as jobId for deduplication.
//
// Events handled by stripe-webhook.worker.ts:
//   - checkout.session.completed    → upsert ACTIVE subscription
//   - customer.subscription.updated → sync status + period
//   - customer.subscription.deleted → set CANCELED
//   - invoice.payment_failed        → set PAST_DUE
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { enqueue, QUEUES } from "@/lib/queue";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "stripe.webhook" });

// Required: disable Next.js body parsing so we get the raw Buffer
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    log.warn("Missing stripe-signature or STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Unauthorized" }, { status: 400 });
  }

  let rawBody: Buffer;
  try {
    rawBody = Buffer.from(await req.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read body" }, { status: 400 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    log.warn({ err }, "Stripe webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Only enqueue events we actually handle — ignore everything else silently
  const HANDLED_EVENTS = [
    "checkout.session.completed",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
  ];

  if (HANDLED_EVENTS.includes(event.type)) {
    await enqueue(
      QUEUES.STRIPE_WEBHOOK,
      { type: event.type, payload: event },
      {
        jobId: event.id, // Deduplication — Stripe delivers at-least-once
        attempts: 5,
      }
    );
    log.info({ eventId: event.id, eventType: event.type }, "Stripe event enqueued");
  } else {
    log.debug({ eventType: event.type }, "Stripe event ignored (not handled)");
  }

  return NextResponse.json({ received: true });
}
