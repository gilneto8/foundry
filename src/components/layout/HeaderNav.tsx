// ============================================================
// src/components/layout/HeaderNav.tsx
// Role-sensitive header navigation.
//
// Server Component — reads the session cookie directly,
// no client-side hydration, no flash of wrong content.
//
// Usage (in a page or layout):
//   import { HeaderNav } from "@/components/layout/HeaderNav";
//   <AppShell appName="Foundry" headerActions={<HeaderNav />}>
//
// Links rendered:
//   All authenticated users: Dashboard, Sign out
//   ADMIN role only:         Admin panel, Queues (Bull Board)
// ============================================================

import Link from "next/link";
import { getSession } from "@/lib/session";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Settings2, List, LogOut } from "lucide-react";

export async function HeaderNav() {
  const session = await getSession();

  // Not logged in — render nothing (public pages handle their own header)
  if (!session) return null;

  const isAdmin = session.role === "ADMIN";

  return (
    <nav className="flex items-center gap-1">
      {/* ── All authenticated users ───────────────────────────── */}
      <Button asChild variant="ghost" size="sm" className="gap-1.5 text-sm">
        <Link href="/dashboard">
          <LayoutDashboard className="size-4" />
          Dashboard
        </Link>
      </Button>

      {/* ── ADMIN only ──────────────────────────────────────────── */}
      {isAdmin && (
        <>
          <div className="mx-1 h-4 w-px bg-border" aria-hidden />

          <Button
            asChild
            variant="ghost"
            size="sm"
            className="gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Link href="/admin">
              <Settings2 className="size-4" />
              Admin
            </Link>
          </Button>

          <Button
            asChild
            variant="ghost"
            size="sm"
            className="gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Link href="/admin/queues">
              <List className="size-4" />
              Queues
            </Link>
          </Button>
        </>
      )}

      {/* ── Sign out ────────────────────────────────────────────── */}
      <div className="mx-1 h-4 w-px bg-border" aria-hidden />

      <form action={logout}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </form>
    </nav>
  );
}
