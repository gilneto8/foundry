import { AppShell } from "@/components/layout";
import { Button } from "@/components/ui/button";

/**
 * Foundry Boilerplate — Default home page.
 * Replace this with your app's actual entry point.
 */
export default function Page() {
  return (
    <AppShell appName="Foundry">
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
        {/* Badge */}
        <span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          Boilerplate v0.1
        </span>

        {/* Heading */}
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          The Factory is Online.
        </h1>

        <p className="max-w-lg text-base text-muted-foreground">
          This is your Foundry starter. Replace this page with your app's
          business logic. Auth, DB, logging, and background workers are
          pre-wired.
        </p>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <Button asChild>
            <a href="https://github.com/yourgithub/foundry" target="_blank" rel="noopener noreferrer">
              View Docs
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/dashboard">Go to Dashboard →</a>
          </Button>
        </div>

        {/* Stack badges */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {["Next.js 16", "React 19", "Tailwind v4", "shadcn/ui", "TypeScript"].map(
            (tech) => (
              <span
                key={tech}
                className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-card-foreground"
              >
                {tech}
              </span>
            )
          )}
        </div>
      </div>
    </AppShell>
  );
}
