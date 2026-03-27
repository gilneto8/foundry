import Link from "next/link";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  /** The name of this specific app, displayed in the header. */
  appName: string;
  /** Optional right-side slot (e.g. UserNav, auth buttons). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * AppHeader — top navigation bar shared across all Foundry apps.
 * Slot `actions` is used for per-app user controls (login, avatar, etc.)
 */
export function AppHeader({ appName, actions, className }: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className
      )}
    >
      <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4 sm:px-6">
        {/* Brand / App Name */}
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-foreground hover:opacity-80 transition-opacity"
        >
          <span className="text-primary">◆</span>
          <span>{appName}</span>
        </Link>

        {/* Right-side slot */}
        {actions && (
          <div className="flex items-center gap-3">{actions}</div>
        )}
      </div>
    </header>
  );
}
