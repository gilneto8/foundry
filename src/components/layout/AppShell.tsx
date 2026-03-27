import { AppHeader } from "./AppHeader";
import { AppSidebar, NavItem } from "./AppSidebar";
import { cn } from "@/lib/utils";

interface AppShellProps {
  appName: string;
  /** Providing navItems enables the sidebar layout. */
  navItems?: NavItem[];
  /** Right-side header slot (e.g. UserNav). */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * AppShell — the primary chrome component for Foundry apps.
 *
 * Usage (in a Next.js layout.tsx):
 *   <AppShell appName="Menu do Dia" navItems={NAV_ITEMS}>
 *     {children}
 *   </AppShell>
 *
 * If navItems is omitted, renders in single-column (no sidebar) mode.
 */
export function AppShell({
  appName,
  navItems,
  headerActions,
  children,
  className,
}: AppShellProps) {
  return (
    <div className={cn("flex min-h-screen flex-col", className)}>
      <AppHeader appName={appName} actions={headerActions} />

      <div className="flex flex-1 overflow-hidden">
        {navItems && navItems.length > 0 && (
          <AppSidebar items={navItems} />
        )}

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-screen-xl px-4 py-8 sm:px-6">
            {children}
          </div>
        </main>
      </div>

      <AppFooter />
    </div>
  );
}

/**
 * AppFooter — minimal bottom bar. Intentionally lightweight.
 */
function AppFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex h-10 max-w-screen-xl items-center justify-center px-4 sm:px-6">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Foundry. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
