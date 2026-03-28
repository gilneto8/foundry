"use client";

// ============================================================
// src/components/billing/manage-subscription-button.tsx
// Client component — calls the Customer Portal API route
// and redirects to Stripe's hosted billing portal.
//
// Used in:
//   - Dashboard header ("Manage Subscription")
//   - PAST_DUE banner ("Update Payment")
// ============================================================

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ComponentProps } from "react";

type ButtonProps = ComponentProps<typeof Button>;

export function ManageSubscriptionButton({
  children,
  ...props
}: ButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/create-portal-session", {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleClick} disabled={loading} {...props}>
      {loading ? "Loading…" : children}
    </Button>
  );
}
