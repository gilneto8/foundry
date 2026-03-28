// ============================================================
// src/app/admin/layout.tsx
// Admin panel layout — ADMIN role gate.
//
// verifyAdminSession() redirects non-admins to "/" automatically.
// All pages under /admin/* inherit this protection.
//
// EXTENDING:
//   Add new admin sections by creating subdirectories:
//     src/app/admin/users/page.tsx
//     src/app/admin/settings/page.tsx
//   They will automatically be gated by this layout.
// ============================================================

import { verifyAdminSession } from "@/lib/session";
import { AppShell } from "@/components/layout";
import { HeaderNav } from "@/components/layout/HeaderNav";

export const metadata = {
  title: "Admin — Foundry",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Redirect non-admins to "/" — no render on unauthorized access.
  await verifyAdminSession();

  return (
    <AppShell appName="Foundry Admin" headerActions={<HeaderNav />}>
      <div className="space-y-6">
        {/* Admin section header */}
        <div className="border-b border-border pb-4">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Admin Panel
          </h1>
          <p className="text-sm text-muted-foreground">
            Internal tooling — visible to ADMIN role only.
          </p>
        </div>

        {/* Page content */}
        {children}
      </div>
    </AppShell>
  );
}
