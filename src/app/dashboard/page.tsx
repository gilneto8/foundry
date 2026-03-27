import { verifySession } from "@/lib/session";
import { AppShell } from "@/components/layout";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

/**
 * /dashboard — Protected route.
 * verifySession() redirects to /login if the user is not authenticated.
 */
export default async function DashboardPage() {
  const session = await verifySession();

  return (
    <AppShell appName="Foundry">
      <div className="space-y-6">
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

          {/* Logout */}
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
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
