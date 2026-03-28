"use client";

// ============================================================
// src/app/pricing/pricing-client.tsx
// Client-side pricing page UI.
//
// ⚠️  REPLACE BEFORE LAUNCH:
//   - Update PLACEHOLDER_PLAN with your real name, price, features
//   - If you have multiple tiers, duplicate the plan card block
//   - Remove placeholder comments
// ============================================================

import { useState } from "react";

const PLACEHOLDER_PLAN = {
  key: "PRO",
  name: "[Plan Name]",            // ← Replace with your plan name
  price: "$X / month",           // ← Replace with your actual price
  features: [
    "[Feature 1]",               // ← Replace with real features
    "[Feature 2]",
    "[Feature 3]",
    "[Feature 4]",
  ],
};

export function PricingClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: PLACEHOLDER_PLAN.key }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      // Redirect to Stripe Hosted Checkout
      window.location.href = data.url;
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Simple, transparent pricing
        </h1>
        <p className="mt-3 text-muted-foreground">
          {/* ← Replace with your product value proposition */}
          [One sentence about what you get for subscribing.]
        </p>
      </div>

      {/* Plan card */}
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            {PLACEHOLDER_PLAN.name}
          </p>
          <p className="mt-2 text-4xl font-extrabold text-foreground">
            {PLACEHOLDER_PLAN.price}
          </p>
        </div>

        <ul className="mb-8 space-y-2">
          {PLACEHOLDER_PLAN.features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="text-green-500">✓</span>
              {f}
            </li>
          ))}
        </ul>

        {error && (
          <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          onClick={handleCheckout}
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Redirecting…" : "Get Started"}
        </button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Already subscribed?{" "}
          <a href="/dashboard" className="underline underline-offset-2">
            Go to dashboard
          </a>
        </p>
      </div>
    </main>
  );
}
