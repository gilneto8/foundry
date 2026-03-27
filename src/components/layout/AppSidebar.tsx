"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavItem {
  label: string;
  href: string;
  /** Optional lucide-react icon component */
  icon?: React.ComponentType<{ className?: string }>;
}

interface AppSidebarProps {
  items: NavItem[];
  className?: string;
}

/**
 * AppSidebar — vertical navigation rail for Foundry dashboard apps.
 * Pass `items` from the per-app layout to customize navigation.
 * Uses Next.js `usePathname` for active state — must be a Client Component.
 */
export function AppSidebar({ items, className }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden w-56 shrink-0 border-r border-border bg-sidebar md:flex md:flex-col",
        className
      )}
    >
      <nav className="flex flex-col gap-1 p-4">
        {items.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              {Icon && <Icon className="size-4 shrink-0" />}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
