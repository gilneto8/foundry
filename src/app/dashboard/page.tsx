import { verifySession } from "@/lib/session";
import { getSubscription } from "@/lib/subscription";
import { AppShell } from "@/components/layout";
import { HeaderNav } from "@/components/layout/HeaderNav";
import { ManageSubscriptionButton } from "@/components/billing/manage-subscription-button";

/**
 * /dashboard — Protected route.
 * verifySession() redirects to /login if the user is not authenticated.
 */
export default async function DashboardPage() {
  const session = await verifySession();

  // ---------------------------------------------------------------------------
  // Billing state — fetch the subscription for this user.
  // Use verifySubscription() instead of getSubscription() if this route
  // should be hard-gated behind an active subscription.
  // ---------------------------------------------------------------------------
  const subscription = await getSubscription(session.userId);
  const isPastDue = subscription?.status === "PAST_DUE";
  const hasCustomer = !!subscription?.stripeCustomerId;

  return (
    <AppShell appName="Foundry" headerActions={<HeaderNav />}>
      <div className="space-y-6">
        {/* Payment failure banner — shown when invoice.payment_failed was received */}
        {isPastDue && (
          <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <span>
              ⚠️ Your last payment failed. Please update your payment method to keep
              access.
            </span>
            <ManageSubscriptionButton variant="destructive" size="sm">
              Update Payment
            </ManageSubscriptionButton>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Logged in as user{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {session.userId}
              </code>{" "}
              with role{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {session.role}
              </code>
            </p>
          </div>

          {/* Manage Subscription — only shown when a Stripe customer exists */}
          {hasCustomer && (
            <ManageSubscriptionButton variant="outline" size="sm">
              Manage Subscription
            </ManageSubscriptionButton>
          )}
        </div>

        {/* Placeholder content */}
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            This is your protected dashboard. Replace this with your app&apos;s
            business logic. Your session is secured via an encrypted{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              HttpOnly
            </code>{" "}
            cookie.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
