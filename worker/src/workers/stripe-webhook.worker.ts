// ============================================================
// worker/src/workers/stripe-webhook.worker.ts
// BullMQ worker for Stripe webhook event processing.
//
// Signature verification is done by the route handler BEFORE
// events are enqueued here. This worker trusts the payload.
//
// Deduplication: the route handler sets jobId = event.id,
// so Stripe's at-least-once delivery doesn't cause double-processing.
//
// Events handled:
//   - checkout.session.completed    → upsert subscription as ACTIVE
//   - customer.subscription.updated → sync status, price, planKey
//   - customer.subscription.deleted → set CANCELED
//   - invoice.payment_failed        → set PAST_DUE
//
// NOTE: Stripe's dahlia API version removed current_period_end from
// the Subscription object. We use cancel_at as the equivalent
// "subscription end date" stored in currentPeriodEnd.
// ============================================================

import { Worker, type Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import type Stripe from "stripe";
import { db } from "../db";
import { QUEUES } from "../queues";
import { logger } from "../logger";

const log = logger.child({ module: "stripe-webhook" });

export interface StripeWebhookJobData {
  type: string;
  payload: Stripe.Event;
}

// ---------------------------------------------------------------------------
// Helper: map a Stripe subscription status to our SubscriptionStatus enum
// ---------------------------------------------------------------------------
function mapStripeStatus(
  stripeStatus: Stripe.Subscription["status"]
): "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "INACTIVE" {
  switch (stripeStatus) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
    case "unpaid":
    case "paused":
      return "CANCELED";
    default:
      return "INACTIVE";
  }
}

// ---------------------------------------------------------------------------
// Helper: extract planKey from subscription metadata
// Falls back to null — planKey is informational, not blocking
// ---------------------------------------------------------------------------
function extractPlanKey(sub: Stripe.Subscription): string | null {
  return (sub.metadata?.planKey as string) ?? null;
}

// ---------------------------------------------------------------------------
// Helper: resolve the best available "subscription end date"
// In dahlia API, current_period_end no longer exists on Subscription.
// We use cancel_at (scheduled cancellation date) if present, else null.
// ---------------------------------------------------------------------------
function resolveEndDate(sub: Stripe.Subscription): Date | null {
  if (sub.cancel_at) return new Date(sub.cancel_at * 1000);
  if (sub.trial_end) return new Date(sub.trial_end * 1000);
  return null;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const userId = session.metadata?.userId;
  const planKey = session.metadata?.planKey;
  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;
  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  if (!userId) {
    log.warn({ sessionId: session.id }, "checkout.session.completed missing userId metadata");
    return;
  }

  await db.subscription.upsert({
    where: { userId },
    update: {
      stripeCustomerId,
      stripeSubscriptionId,
      planKey: planKey ?? null,
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
    },
    create: {
      userId,
      stripeCustomerId,
      stripeSubscriptionId,
      planKey: planKey ?? null,
      status: "ACTIVE",
    },
  });

  log.info({ userId, planKey, stripeCustomerId }, "Subscription activated via checkout");
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription): Promise<void> {
  const userId = sub.metadata?.userId;
  if (!userId) {
    log.warn({ subId: sub.id }, "subscription.updated missing userId metadata — skipping");
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;

  await db.subscription.update({
    where: { userId },
    data: {
      status: mapStripeStatus(sub.status),
      stripePriceId: priceId,
      planKey: extractPlanKey(sub),
      currentPeriodEnd: resolveEndDate(sub),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });

  log.info({ userId, status: sub.status }, "Subscription updated");
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const userId = sub.metadata?.userId;
  if (!userId) {
    log.warn({ subId: sub.id }, "subscription.deleted missing userId metadata — skipping");
    return;
  }

  await db.subscription.update({
    where: { userId },
    data: { status: "CANCELED", cancelAtPeriodEnd: false },
  });

  log.info({ userId }, "Subscription canceled");
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  await db.subscription.updateMany({
    where: { stripeCustomerId: customerId },
    data: { status: "PAST_DUE" },
  });

  log.warn({ stripeCustomerId: customerId }, "Invoice payment failed — subscription set to PAST_DUE");
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------
export function createStripeWebhookWorker(connection: ConnectionOptions) {
  const worker = new Worker<StripeWebhookJobData>(
    QUEUES.STRIPE_WEBHOOK,
    async (job: Job<StripeWebhookJobData>) => {
      const { type, payload } = job.data;

      log.info({ eventId: payload.id, eventType: type }, "Processing Stripe event");

      switch (type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(payload.data.object as Stripe.Checkout.Session);
          break;
        case "customer.subscription.updated":
          await handleSubscriptionUpdated(payload.data.object as Stripe.Subscription);
          break;
        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(payload.data.object as Stripe.Subscription);
          break;
        case "invoice.payment_failed":
          await handleInvoicePaymentFailed(payload.data.object as Stripe.Invoice);
          break;
        default:
          log.debug({ eventType: type }, "Unhandled event type — no-op");
      }
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("completed", (job) =>
    log.info({ jobId: job.id, eventType: job.data.type }, "Stripe event processed")
  );
  worker.on("failed", (job, err) =>
    log.error({ jobId: job?.id, eventType: job?.data?.type, err }, "Stripe event processing failed")
  );

  return worker;
}
