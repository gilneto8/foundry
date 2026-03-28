// ============================================================
// src/app/admin/page.tsx
// Admin panel landing page — /admin
//
// Serves as an extensible hub for all admin tooling.
// Add new cards below as you build new admin sections.
// ============================================================

import Link from "next/link";

const adminSections = [
  {
    href: "/admin/queues",
    title: "Job Queues",
    description:
      "Inspect, retry, and discard BullMQ jobs across all queues — including the email DLQ.",
    icon: "📬",
  },
  // Add more sections here as you build them:
  // {
  //   href: "/admin/users",
  //   title: "Users",
  //   description: "View and manage user accounts.",
  //   icon: "👥",
  // },
];

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Select a section to get started.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {adminSections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-foreground/30 hover:bg-accent"
          >
            <div className="mb-3 text-2xl">{section.icon}</div>
            <h2 className="mb-1 text-base font-semibold text-foreground group-hover:text-foreground">
              {section.title}
            </h2>
            <p className="text-sm text-muted-foreground">{section.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
