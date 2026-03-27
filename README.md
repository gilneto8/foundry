# 🏭 The Foundry (Boilerplate)

A high-performance SaaS manufacturing line for a single Hetzner VPS. Optimized for rapid deployment of B2B utility applications with minimal server overhead. Clone it, rename it, ship it.

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.1 (App Router, Turbopack) |
| Runtime | React 19 |
| Styling | Tailwind CSS v4 (zero config — no `tailwind.config.js`) |
| UI Components | shadcn/ui (Nova preset, Radix UI) |
| Database | PostgreSQL 16 via Prisma 7.6.0 |
| Password Hashing | Argon2 |
| Session Management | Stateless JWT via `jose` (HttpOnly cookies) |
| Background Jobs | BullMQ + Redis 7 |
| PDF Generation | Playwright (headless Chromium, pluggable adapter) |
| Logging | Pino — structured JSON to stdout, `pino-pretty` in dev |
| Observability | Docker json-file driver → Promtail `docker_sd_configs` → Loki → Grafana |
| Containers | Docker — multi-stage build (Alpine for app, Debian slim for worker) |
| Language | TypeScript 5 (strict) |

---

## 🚀 Local Development

```bash
# 1. Install all dependencies (Next.js app only)
npm install

# 2. Copy env file and fill in values
cp .env.example .env

# 3. Run the database migration (PostgreSQL must be running)
npx prisma migrate dev

# 4. Start the dev server
npm run dev
# → http://localhost:3000
```

> For local development, you do **not** need Docker — just a running PostgreSQL instance pointed to by `DATABASE_URL` in your `.env`.

---

## 🐳 Production (Docker)

The full production stack is 4 containers managed by Docker Compose:

| Container | Image | Purpose |
|---|---|---|
| `foundry_app` | `foundry-app` | Next.js standalone server |
| `foundry_worker` | `foundry-worker` | BullMQ background job processor |
| `foundry_db` | `postgres:16-alpine` | PostgreSQL database |
| `foundry_redis` | `redis:7-alpine` | Job queue broker |

```bash
# Build images and start all 4 containers
docker compose up --build -d

# Apply migrations from the HOST (not inside the container — the runner image has no Prisma CLI)
DATABASE_URL="postgresql://foundry:foundry_secret@localhost:5432/foundry" npx prisma migrate deploy

# View logs
docker compose logs -f app
docker compose logs -f worker
```

> **Why migrate from the host?** The production `foundry_app` runner image is stripped to the bare minimum — only the compiled Next.js `standalone` output. There is no `node_modules`, no Prisma CLI. Migrations must be run from where the full toolchain exists: the host machine.

---

## 🏗️ Building a New Product from This Boilerplate

Follow these steps in order when spinning up a new product. Everything below is explicit — no archaeology required.

---

### Step 1 — Rename the Project

1. Update `package.json` → change `"name": "foundry"` to your product slug (e.g. `"name": "invoicer"`).
2. Update `docker-compose.yml` → change all `container_name: foundry_*` values to match your product (e.g. `invoicer_app`, `invoicer_db`, etc.).
3. Update `README.md` → replace references to "Foundry" with your product name.
4. Update `src/app/layout.tsx` → replace the `metadata` block with your real product title, description, and OpenGraph data (see Step 6).

---

### Step 2 — Configure the Database

The schema lives in `prisma/schema.prisma`. It comes with two models: `User` and `Session`. Add your own models here.

**Example — adding a `Project` model:**

```prisma
// prisma/schema.prisma
model Project {
  id        String   @id @default(cuid())
  name      String
  userId    String
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("projects")
}
```

After editing the schema:

```bash
# Create and apply the migration locally
npx prisma migrate dev --name add_projects

# Regenerate the Prisma client (run this whenever the schema changes)
npx prisma generate
```

Use the database from your Server Actions or API routes via the singleton client:

```ts
import { db } from "@/lib/db";

const projects = await db.project.findMany({ where: { userId: session.userId } });
```

---

### Step 3 — Configure Authentication

Auth is fully implemented. Users register via `/signup`, log in via `/login`, and are session-managed via HttpOnly JWT cookies.

**What you'll want to change:**

- **User roles**: `prisma/schema.prisma` → `UserRole` enum. Add `ADMIN`, `MEMBER`, etc. as needed. Run a migration after.
- **Session duration**: `src/lib/session.ts` → change the `expiresAt` value (currently `7 days`).
- **Protected routes**: `src/proxy.ts` → the `PROTECTED_PATHS` array controls which routes require a valid session. Add your dashboard routes here.
- **Public routes**: `src/proxy.ts` → `PUBLIC_PATHS` — routes that authenticated users should be redirected *away* from (e.g. login, signup).
- **Post-login redirect**: `src/app/actions/auth.ts` → `redirect("/dashboard")` — change the destination to your product's main page.

---

### Step 4 — Add Background Jobs

Background jobs offload heavy operations (PDF generation, email sending, data processing) away from the Next.js request cycle. The infrastructure (Redis + BullMQ) is already running — you just need to wire in your logic.

#### Worker architecture

Each job type lives in its own file. `worker/src/worker.ts` is a slim orchestrator that boots them all.

```
worker/src/
  adapters/
    playwright.ts        ← Pluggable browser adapter (PDF, screenshots). Remove if not needed.
  workers/
    example.worker.ts    ← Delete this. It's a placeholder.
    pdf.worker.ts        ← PDF generation via the Playwright adapter.
    my-thing.worker.ts   ← Your new worker goes here.
  worker.ts              ← Boots all workers + handles graceful shutdown.
  queues.ts              ← Queue name registry (worker side).
  connection.ts          ← Redis URL parser.
```

#### There are three things to touch every time you add a new job type:

---

**1. Register the queue name in both registries**

They must be identical strings. One lives in the app, one in the worker.

```ts
// src/lib/queue.ts  (Next.js app side)
export const QUEUES = {
  EXAMPLE: "example",
  PDF_GENERATE: "pdf_generate",
  SEND_EMAIL: "send_email",  // ← add here
} as const;
```

```ts
// worker/src/queues.ts  (worker side)
export const QUEUES = {
  EXAMPLE: "example",
  PDF_GENERATE: "pdf_generate",
  SEND_EMAIL: "send_email",  // ← add here too — must match exactly
} as const;
```

> ⚠️ If these don't match, jobs will be enqueued and silently never consumed.

---

**2. Create a worker file in `worker/src/workers/`**

Each worker exports a factory function that takes the shared Redis `connection`.

```ts
// worker/src/workers/email.worker.ts
import { Worker, type Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { QUEUES } from "../queues";

export interface EmailJobData {
  to: string;
  template: string;
  userId: string;
}

export function createEmailWorker(connection: ConnectionOptions) {
  const worker = new Worker<EmailJobData>(
    QUEUES.SEND_EMAIL,
    async (job: Job<EmailJobData>) => {
      const { to, template, userId } = job.data;
      // Your logic here — call Resend, Brevo, Nodemailer, etc.
      await sendTransactionalEmail({ to, template });
      return { sent: true };
    },
    {
      connection,
      concurrency: 10, // tune to your VPS RAM — email is cheap, PDFs are not
    }
  );

  worker.on("completed", (job) => console.log(`[email] ✓ ${job.id}`));
  worker.on("failed", (job, err) => console.error(`[email] ✗ ${job?.id}`, err.message));

  return worker;
}
```

---

**3. Register the worker in `worker/src/worker.ts`**

```ts
import { createEmailWorker } from "./workers/email.worker";

const workers = [
  createExampleWorker(connection),
  createPdfWorker(connection),
  createEmailWorker(connection),  // ← add here
];

async function shutdown() {
  await Promise.all(workers.map((w) => w.close()));
  // ...
}
```

---

**4. Enqueue jobs from the Next.js app**

```ts
// src/app/actions/onboarding.ts
"use server";
import { enqueue, QUEUES } from "@/lib/queue";

export async function sendWelcomeEmail(userId: string, email: string) {
  await enqueue(QUEUES.SEND_EMAIL, { userId, email, template: "welcome" });
}
```

`enqueue()` signature:

```ts
enqueue(
  queue: QueueName,       // must match a key in QUEUES
  data: object,           // serializable payload — this is what the worker receives as job.data
  opts?: {
    delay?: number,       // delay in ms before the job runs
    attempts?: number,    // override default of 3 retries
    jobId?: string,       // deterministic ID to deduplicate jobs
  }
)
```

After editing any worker file, rebuild and restart:

```bash
docker compose build worker && docker compose up -d worker
```

#### The Playwright adapter (PDF / Screenshots)

The boilerplate ships with a headless browser adapter at `worker/src/adapters/playwright.ts`. It is completely decoupled from BullMQ — no queue logic inside it.

The `pdf.worker.ts` uses it like this:

```ts
import { generatePdf } from "../adapters/playwright";

const pdfBuffer = await generatePdf("https://your-app.com/invoice/123", {
  format: "A4",
  printBackground: true,
});
// returns a Buffer — store it in S3, stream it to the user, etc.
```

The adapter also exposes:
- `takeScreenshot(url, opts)` — returns a `Buffer` (PNG or JPEG)
- `withPage(async (page, context) => { ... })` — raw low-level access to a Playwright page
- `closeBrowser()` — called during graceful shutdown in `worker.ts`

**PDF worker concurrency:** Chromium uses ~150-300MB per context. The PDF worker is capped at `concurrency: 1` plus a rate limiter (5 jobs / 10s). Increase only after benchmarking your specific VPS load.

**If your product doesn't need PDFs:**
1. Delete `worker/src/adapters/playwright.ts`
2. Delete `worker/src/workers/pdf.worker.ts`
3. Remove `PDF_GENERATE` from both `QUEUES` registries
4. Remove `playwright` from `worker/package.json`
5. In `worker/Dockerfile`, switch back to `node:24-slim` without the Playwright install — or revert to Alpine for a smaller image

---

### Step 5 — Logging & Observability

The boilerplate ships with structured logging wired end-to-end. In production, every log line is a JSON object that flows into your Grafana/Loki stack automatically via Promtail.

#### How it works

```
stdout (JSON)
  └── Docker json-file driver — writes /var/lib/docker/containers/<id>/*-json.log
        └── Promtail docker_sd_configs — autodiscovers containers, maps name → {app} label
              └── Loki — indexes logs
                    └── Grafana — query with {app="foundry_app"} or {app="foundry_worker"}
```

**No Promtail config changes needed.** The existing `__meta_docker_container_name` relabel rule already maps:
- `foundry_app` → `{app="foundry_app"}`
- `foundry_worker` → `{app="foundry_worker"}`

#### The logger

Two singletons, same design:
- `src/lib/logger.ts` — Next.js app (`server-only`, safe in Server Actions and middleware)
- `worker/src/logger.ts` — Worker process

```ts
import { logger } from "@/lib/logger"; // or "./logger" in the worker

// Scoped child logger for a module
const log = logger.child({ module: "payments" });

// Structured log — fields are queryable in Loki
log.info({ userId, invoiceId, amount }, "Invoice generated");
log.warn({ userId, path }, "Rate limit approaching");
log.error({ err, jobId }, "PDF generation failed");
```

Log levels: `trace` → `debug` → `info` → `warn` → `error` → `fatal`.
Default: `debug` in dev, `info` in production. Override with `LOG_LEVEL` env var.

#### What's already instrumented

| Module | Events logged |
|---|---|
| `src/proxy.ts` | Unauthenticated access to protected route, authenticated redirect |
| `src/app/actions/auth.ts` | Signup (success + duplicate email), login (success + wrong password + unknown email), logout |
| `worker/src/worker.ts` | Startup (with queue list), graceful shutdown |
| `worker/src/workers/pdf.worker.ts` | Job start (jobId + URL), PDF render complete (jobId + bytes), failures |
| `worker/src/workers/example.worker.ts` | Job start, completion, failures |

#### Sensitive field redaction

Pino's `redact` option is configured to **automatically censor** these fields before they reach stdout:
`password`, `passwordHash`, `token`, `secret`, `cookie`.

Add more paths in `src/lib/logger.ts` if your product handles PII.

#### When you add a new worker

```ts
// worker/src/workers/my-thing.worker.ts
import { logger } from "../logger";
const log = logger.child({ module: "my-thing" });

// Inside the worker handler:
log.info({ jobId: job.id, ...relevantFields }, "Processing job");
```

---

### Step 6 — Add New Pages and Routes

Pages go in `src/app/`. The App Router convention applies:

```
src/app/
  (auth)/           ← route group, no layout prefix
    login/
    signup/
  dashboard/        ← protected route (guarded by proxy.ts)
  projects/         ← add your product routes here
    [id]/
      page.tsx
  api/              ← API routes / Route Handlers
    health/
      route.ts
```

To protect a new route, add it to `PROTECTED_PATHS` in `src/proxy.ts`:

```ts
const PROTECTED_PATHS = ["/dashboard", "/projects", "/settings"];
```

---

### Step 7 — Configure SEO & AI Metadata

All metadata lives in `src/app/layout.tsx`. Update these fields for your product before launch:

```ts
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://your-product.com";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    template: "%s | Your Product Name",
    default: "Your Product — Tagline here",
  },
  description: "One clear sentence about what your product does.",
  keywords: ["your", "product", "keywords"],
  authors: [{ name: "Your Name" }],

  openGraph: {
    title: "Your Product Name",
    description: "One clear sentence about what your product does.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    // ...
  },
};
```

Also update:
- `src/app/robots.ts` — add your private routes to `disallow` (e.g. `/dashboard/`, `/api/`).
- `src/app/sitemap.ts` — add your public pages to the sitemap array.
- `/public/og-image.png` — replace the placeholder with a real social card (1200×630px).
- Set `NEXT_PUBLIC_APP_URL` in your `.env` to your production domain.

---

### Step 8 — Expose on the VPS via Nginx

The boilerplate ships with a production-ready Nginx config template and deployment guide in `deploy/nginx/`.

> **⚠️ Port collision warning:** Port `3000` might be taken by another app. Search for free ports using `docker ps` and `lsof -i :<port>` for new Foundry products. The `docker-compose.yml` should default to a free port, e.g. `127.0.0.1:4003:3000` — change the host port per product before deploying.

**TL;DR:**

```bash
# 1. Copy the template
sudo cp deploy/nginx/foundry.conf.template /etc/nginx/sites-available/YOUR_PRODUCT.conf

# 2. Replace the two placeholders in the file:
#    {{APP_DOMAIN}} → your-product.com (4 occurrences)
#    {{APP_PORT}}   → host port from docker-compose.yml, e.g. 4003 (3 occurrences)
sudo nano /etc/nginx/sites-available/YOUR_PRODUCT.conf

# 3. Test — NEVER skip this
sudo nginx -t

# 4. Enable
sudo ln -s /etc/nginx/sites-available/YOUR_PRODUCT.conf /etc/nginx/sites-enabled/

# 5. Reload (not restart — live sites stay up)
sudo systemctl reload nginx

# 6. SSL
sudo certbot --nginx -d your-product.com
```

> See [`deploy/nginx/README.md`](deploy/nginx/README.md) for the full procedure including the port registry, rollback steps, Certbot `--expand` usage, and the common mistakes table.

---

### Step 9 — Environment Variables Checklist

Before deploying to production, ensure these are set:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SESSION_SECRET` | ✅ | 32-byte secret for JWT signing. Generate: `openssl rand -base64 32` |
| `REDIS_URL` | ✅ | Redis connection string (set automatically by compose for Docker) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Your public domain — used for canonical URLs and sitemap |

---

## 📁 Key Files Reference

| File | What it does |
|---|---|
| `src/lib/db.ts` | Lazy Prisma singleton — safe at build time |
| `src/lib/session.ts` | JWT create/verify, session cookie management |
| `src/lib/queue.ts` | `enqueue()` — push jobs to Redis from the Next.js app |
| `src/lib/logger.ts` | Pino logger for the Next.js app (`server-only`) |
| `src/proxy.ts` | Route protection middleware (Next.js 16: `proxy.ts`, not `middleware.ts`) |
| `src/app/actions/auth.ts` | Signup, Login, Logout Server Actions |
| `src/app/layout.tsx` | Root metadata — SEO, OpenGraph, Twitter cards |
| `src/app/robots.ts` | Robots.txt — crawler access control |
| `src/app/sitemap.ts` | Dynamic XML sitemap |
| `prisma/schema.prisma` | Database models |
| `worker/src/logger.ts` | Pino logger for the worker process |
| `worker/src/worker.ts` | Slim orchestrator — boots all workers, handles graceful shutdown |
| `worker/src/workers/example.worker.ts` | Placeholder worker — delete and replace with real domain workers |
| `worker/src/workers/pdf.worker.ts` | PDF generation worker — `concurrency: 1`, uses Playwright adapter |
| `worker/src/adapters/playwright.ts` | Pluggable headless Chromium adapter — `generatePdf()`, `takeScreenshot()`, `withPage()` |
| `worker/src/queues.ts` | Canonical queue name registry (worker side — must mirror `src/lib/queue.ts`) |
| `deploy/nginx/foundry.conf.template` | Nginx config template — copy, replace `{{APP_DOMAIN}}` + `{{APP_PORT}}`, enable via symlink |
| `deploy/nginx/README.md` | Full Nginx deployment guide — port registry, Certbot, rollback |
| `docs/foundry-action-plan.md` | Full implementation status and architecture decisions |



