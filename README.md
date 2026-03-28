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
| Email | Nodemailer (SMTP) + React Email templates + BullMQ async delivery + DLQ |
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

# 4. Seed the database (creates the default ADMIN user)
npm run db:seed

# 5. Start the dev server
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

# Seed the database (creates the ADMIN user — idempotent, safe to re-run)
DATABASE_URL="postgresql://foundry:foundry_secret@localhost:5432/foundry" npm run db:seed

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

#### Seeding

The boilerplate ships with a seed that creates a default ADMIN user. Run it once after the first migration:

```bash
# Reads DATABASE_URL from .env automatically
npm run db:seed
```

Default credentials (change via env vars before production):

| Field | Value |
|---|---|
| Email | `admin@foundry.local` |
| Password | `admin123` |
| Role | `ADMIN` |

Override with environment variables:

```bash
SEED_ADMIN_EMAIL=you@yourdomain.com SEED_ADMIN_PASSWORD=strongpassword npm run db:seed
```

The seed is **idempotent** — running it multiple times will not create duplicates. It uses `upsert` on the email field.

The seed command is configured in `prisma.config.ts` → `migrations.seed`. `prisma migrate dev` will also run it automatically after each migration in development.

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
    email.worker.ts      ← Email delivery via Nodemailer/SMTP. DLQ on exhaustion.
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
  EMAIL_SEND: "email_send",   // already registered — reserved for the email layer
  EMAIL_DLQ: "email_dlq",    // dead-letter queue for exhausted email jobs
  MY_THING: "my_thing",      // ← add your own here
} as const;
```

```ts
// worker/src/queues.ts  (worker side)
export const QUEUES = {
  EXAMPLE: "example",
  PDF_GENERATE: "pdf_generate",
  EMAIL_SEND: "email_send",   // already registered — reserved
  EMAIL_DLQ: "email_dlq",    // dead-letter queue
  MY_THING: "my_thing",      // ← add here too — must match exactly
} as const;
```

> ⚠️ If these don't match, jobs will be enqueued and silently never consumed.

---

**2. Create a worker file in `worker/src/workers/`**

Each worker exports a factory function that takes the shared Redis `connection`.

```ts
// worker/src/workers/my-thing.worker.ts
import { Worker, type Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { QUEUES } from "../queues";
import { logger } from "../logger";

const log = logger.child({ module: "my-thing" });

export interface MyThingJobData {
  userId: string;
  someField: string;
}

export function createMyThingWorker(connection: ConnectionOptions) {
  const worker = new Worker<MyThingJobData>(
    QUEUES.MY_THING,
    async (job: Job<MyThingJobData>) => {
      const { userId, someField } = job.data;
      // Your logic here
      log.info({ jobId: job.id, userId }, "Processing job");
    },
    {
      connection,
      concurrency: 5,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 0 },
    }
  );

  worker.on("completed", (job) => log.info({ jobId: job.id }, "Job completed"));
  worker.on("failed", (job, err) => log.error({ jobId: job?.id, err }, "Job failed"));

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

export async function runMyThing(userId: string, someField: string) {
  await enqueue(QUEUES.MY_THING, { userId, someField });
}
```

> For email sending specifically, use the dedicated email layer described in **Step 11** — it handles SMTP transport, templates, retries, and DLQ automatically.

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
| `src/lib/email.ts` | `email.enqueued` (jobId + subject), `email.sent` (messageId), `email.failed` (error), `email.config_error` |
| `worker/src/worker.ts` | Startup (with queue list), graceful shutdown |
| `worker/src/workers/email.worker.ts` | `email.delivered` (jobId), `email.failed` (attempt count, exhausted flag), `email.worker_error` |
| `worker/src/workers/pdf.worker.ts` | Job start (jobId + URL), PDF render complete (jobId + bytes), failures |
| `worker/src/workers/example.worker.ts` | Job start, completion, failures |

#### Sensitive field redaction

Pino's `redact` option is configured to **automatically censor** these fields before they reach stdout:
`password`, `passwordHash`, `token`, `secret`, `cookie`, `to` (email recipient addresses).

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
| `NEXT_PUBLIC_APP_URL` | ✅ | Your public domain — used for canonical URLs, sitemap, and Stripe redirects |
| `STRIPE_SECRET_KEY` | ⚡ | Stripe secret key (`sk_test_...` locally, `sk_live_...` in production) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ⚡ | Stripe publishable key — safe to expose to the browser |
| `STRIPE_WEBHOOK_SECRET` | ⚡ | Stripe webhook secret (`whsec_...`). See Step 10 for local dev setup |
| `STRIPE_PRICE_ID_PRO` | ⚡ | Stripe Price ID for the Pro tier. Create in the Stripe dashboard |
| `SMTP_HOST` | 📧 | SMTP server hostname — e.g. `smtp.resend.com`, `smtp.mailgun.org` |
| `SMTP_PORT` | 📧 | SMTP port — `587` (STARTTLS, default) or `465` (implicit TLS) |
| `SMTP_USER` | 📧 | SMTP username / API key username |
| `SMTP_PASS` | 📧 | SMTP password / API key |
| `SMTP_FROM` | 📧 | Default sender address — e.g. `My App <noreply@myapp.com>` |

> ⚡ = Required only if using the Stripe billing layer. Leave unset to skip billing entirely.
> 📧 = Required only if using the email layer. Leave unset to disable email.

---

### Step 10 — Configure Stripe Billing

The boilerplate ships with a complete, generic billing layer. After cloning, all you need to do is fill in your Stripe keys and update the placeholder copy.

#### What ships out-of-the-box

| Piece | Description |
|---|---|
| `src/lib/stripe.ts` | Lazy Stripe client singleton |
| `src/lib/subscription.ts` | `PLANS` config + `verifySubscription()` utility |
| `src/app/pricing/page.tsx` | Placeholder pricing page with a single plan card |
| `src/app/api/stripe/create-checkout-session` | Creates a Stripe Hosted Checkout session |
| `src/app/api/stripe/create-portal-session` | Creates a Stripe Customer Portal session |
| `src/app/api/stripe/webhook` | Receives Stripe events, enqueues to BullMQ |
| `src/app/api/stripe/dev-fulfill` | **Dev-only** bypass — sets a user to ACTIVE without Stripe |
| `worker/src/workers/stripe-webhook.worker.ts` | Processes Stripe events from the queue |
| `src/components/billing/manage-subscription-button.tsx` | "Manage Subscription" button → Stripe portal |
| Dashboard PAST_DUE banner | Warning shown when `invoice.payment_failed` is received |

---

#### 1. Get your Stripe keys

1. Go to [https://dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys)
2. Copy your **Secret key** (`sk_test_...`) and **Publishable key** (`pk_test_...`)
3. Create a product and price in [https://dashboard.stripe.com/products](https://dashboard.stripe.com/products)
4. Copy the **Price ID** (`price_...`)
5. Fill in your `.env`:

```bash
STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_PRICE_ID_PRO="price_..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

#### 2. Set up the Customer Portal

Before the portal works, you must enable it in the Stripe dashboard:
[https://dashboard.stripe.com/settings/billing/portal](https://dashboard.stripe.com/settings/billing/portal)

Just enable it and save — no custom configuration needed.

---

#### 3. Local dev — Stripe webhook forwarding

Webhooks need a publicly accessible URL. For local development, use the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
# Install the CLI (once)
brew install stripe/stripe-cli/stripe

# Log in
stripe login

# Get your local webhook secret
stripe listen --print-secret
# → copy the whsec_... value into STRIPE_WEBHOOK_SECRET in your .env

# Forward events to your local server (run in a separate terminal)
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Now complete a test checkout in your browser — the CLI will forward the `checkout.session.completed` event and your BullMQ worker will process it.

---

#### 4. Dev bypass (skip Stripe CLI entirely)

When you're building product features and don't want to deal with the Stripe CLI, use the dev fulfillment bypass to manually set a user to `ACTIVE`:

```bash
curl -X POST http://localhost:3000/api/stripe/dev-fulfill \
  -H "Content-Type: application/json" \
  -d '{"userId": "YOUR_USER_ID_FROM_DB", "planKey": "PRO"}'
```

> ⚠️ This route **returns 404 in production** (`NODE_ENV=production`). It is safe to ship.

---

#### 5. Update the placeholder pricing page

Open `src/app/pricing/page.tsx` and update the `PLACEHOLDER_PLAN` object:

```ts
const PLACEHOLDER_PLAN = {
  key: "PRO",
  name: "Pro",                   // ← Your plan name
  price: "€29 / month",         // ← Your real price
  features: [
    "Unlimited exports",         // ← Your real features
    "Priority support",
    "Custom branding",
  ],
};
```

---

#### 6. Gate a route behind a subscription

Use `verifySubscription()` anywhere you use `verifySession()`. It works the same way — redirects to `/pricing` if the user is not `ACTIVE`:

```ts
// src/app/some-protected-route/page.tsx
import { verifySession } from "@/lib/session";
import { verifySubscription } from "@/lib/subscription";

export default async function ProtectedPage() {
  const session = await verifySession();
  const subscription = await verifySubscription(session.userId); // → redirects to /pricing if not ACTIVE
  // ...
}
```

---

#### 7. Add a second tier

1. Create a second price in the Stripe dashboard
2. Add to `.env`: `STRIPE_PRICE_ID_BUSINESS="price_..."`
3. Uncomment the `BUSINESS` entry in `src/lib/subscription.ts` → `PLANS`
4. Add a second plan card to `src/app/pricing/page.tsx`

---

#### 8. Webhook events and database state

| Stripe event | Result in `subscriptions` table |
|---|---|
| `checkout.session.completed` | `status = ACTIVE`, `stripeCustomerId`, `stripeSubscriptionId`, `planKey` set |
| `customer.subscription.updated` | `status`, `stripePriceId`, `planKey`, `cancelAtPeriodEnd` synced |
| `customer.subscription.deleted` | `status = CANCELED` |
| `invoice.payment_failed` | `status = PAST_DUE` — banner shown in dashboard |

---

### Step 11 — Send Emails

The boilerplate ships with a complete email layer. Configure SMTP credentials in `.env` and call the exposed functions — no other setup required.

#### What ships out-of-the-box

| Piece | Description |
|---|---|
| `src/lib/email.ts` | `sendEmail()` (sync, critical path) + `enqueueEmail()` (async BullMQ) |
| `src/emails/welcome.tsx` | Placeholder React Email template — fork this for new templates |
| `src/emails/index.ts` | Barrel export for all email templates |
| `worker/src/workers/email.worker.ts` | BullMQ worker — 5 retries, exponential backoff, DLQ on exhaustion |
| `src/app/admin/queues/` | Bull Board UI — inspect, retry, and drain all queues including the DLQ |
| `src/app/admin/layout.tsx` | ADMIN-gated admin panel layout (extensible — add new sections here) |

---

#### 1. Configure SMTP

Add to your `.env`:

```bash
SMTP_HOST="smtp.resend.com"           # or smtp.mailgun.org, email-smtp.<region>.amazonaws.com
SMTP_PORT="587"                        # 587 = STARTTLS (default), 465 = SSL
SMTP_USER="resend"                     # username — provider-specific
SMTP_PASS="re_YOUR_API_KEY_HERE"       # password / API key
SMTP_FROM="My App <noreply@myapp.com>"
```

Provider quick-reference:

| Provider | Host | Port | User | Pass |
|---|---|---|---|---|
| Resend | `smtp.resend.com` | `587` | `resend` | your API key |
| Mailgun | `smtp.mailgun.org` | `587` | full `user@mg.domain` | SMTP password |
| AWS SES | `email-smtp.<region>.amazonaws.com` | `587` | SMTP access key ID | SMTP secret |
| Postmark | `smtp.postmarkapp.com` | `587` | your server token | your server token |

---

#### 2. Create a template

Templates are React Email components in `src/emails/`. Fork `welcome.tsx` as a starting point:

```tsx
// src/emails/invoice.tsx
import { Html, Body, Heading, Text } from "@react-email/components";

export function InvoiceEmail({ name, amount }: { name: string; amount: string }) {
  return (
    <Html><Body>
      <Heading>Your invoice for {amount}</Heading>
      <Text>Hi {name}, your payment was received. Thank you.</Text>
    </Body></Html>
  );
}
```

Export it from `src/emails/index.ts`:

```ts
export { InvoiceEmail } from "./invoice";
```

---

#### 3. Send emails

**Non-critical (welcome, receipts, digests) → async via BullMQ:**

```ts
import { render } from "@react-email/render";
import { WelcomeEmail } from "@/emails";
import { enqueueEmail } from "@/lib/email";

const html = await render(<WelcomeEmail name={user.name} appName="Acme" />);
await enqueueEmail({ to: user.email, subject: "Welcome to Acme!", html });
// → fire-and-forget: 5 retries, exponential backoff, DLQ on exhaustion
```

**Critical (password reset, OTP, payment alert) → sync direct send:**

```ts
import { sendEmail } from "@/lib/email";

const result = await sendEmail({
  to: user.email,
  subject: "Reset your password",
  html: "<p>Click here to reset: ...</p>",
});

if (!result.ok) {
  // result.error contains the reason — log it, show flash message, etc.
}
```

`sendEmail()` never throws — it always returns `{ ok: true, messageId }` or `{ ok: false, error }`.

---

#### 4. Inspect and retry failed emails (DLQ)

When all 5 retry attempts are exhausted, the job is copied to the `email_dlq` queue for manual review.

**Access Bull Board** (requires a user with `role = ADMIN` in the database):

```
https://your-app.com/admin/queues
```

From here you can:
- **Inspect** failed jobs — see `to`, `subject`, `failedReason`, `attemptsMade`, and timestamps
- **Retry** individual jobs — moves them back to `email_send` for reprocessing
- **Retry All** — bulk recovery after a provider outage
- **Delete** — permanently discard dead jobs

> **Setting a user as ADMIN:** Update directly in the database until you build an admin UI:
> ```bash
> docker exec -it foundry_db psql -U foundry -c "UPDATE users SET role = 'ADMIN' WHERE email = 'you@yourdomain.com';"
> ```

---

#### 5. Preview templates locally

React Email ships a dev preview server:

```bash
npx email dev --dir src/emails
# → http://localhost:3000 — live preview of all templates
```

---


## 📁 Key Files Reference

| File | What it does |
|---|---|
| `src/lib/db.ts` | Lazy Prisma singleton — safe at build time |
| `src/lib/session.ts` | JWT create/verify, session cookie management, `verifyAdminSession()` |
| `src/lib/queue.ts` | `enqueue()` — push jobs to Redis from the Next.js app |
| `src/lib/logger.ts` | Pino logger for the Next.js app (`server-only`) |
| `src/lib/email.ts` | `sendEmail()` (sync) + `enqueueEmail()` (async) — Nodemailer/SMTP transport |
| `src/lib/stripe.ts` | Lazy Stripe client singleton — safe at build time |
| `src/lib/subscription.ts` | `PLANS` config, `verifySubscription()`, `getSubscription()` |
| `src/emails/welcome.tsx` | Placeholder React Email template — fork for new templates |
| `src/emails/index.ts` | Barrel export for all email templates |
| `src/proxy.ts` | Route protection middleware (Next.js 16: `proxy.ts`, not `middleware.ts`) |
| `src/app/actions/auth.ts` | Signup, Login, Logout Server Actions |
| `src/app/layout.tsx` | Root metadata — SEO, OpenGraph, Twitter cards |
| `src/app/robots.ts` | Robots.txt — crawler access control |
| `src/app/sitemap.ts` | Dynamic XML sitemap |
| `src/app/pricing/page.tsx` | Placeholder pricing page — update copy before launch |
| `src/app/admin/layout.tsx` | ADMIN-gated admin panel layout — extensible, add new sections here |
| `src/app/admin/page.tsx` | Admin panel landing page — card-grid, add new admin sections by appending to the array |
| `src/app/admin/queues/[[...slug]]/route.ts` | Bull Board UI at `/admin/queues` — inspect, retry, drain all queues |
| `src/app/api/stripe/create-checkout-session/route.ts` | Creates Stripe Hosted Checkout session |
| `src/app/api/stripe/create-portal-session/route.ts` | Creates Stripe Customer Portal session |
| `src/app/api/stripe/webhook/route.ts` | Verifies Stripe signature → enqueues event to BullMQ |
| `src/app/api/stripe/dev-fulfill/route.ts` | Dev-only bypass — sets user to ACTIVE (404 in production) |
| `src/components/billing/manage-subscription-button.tsx` | "Manage Subscription" client button → Stripe portal |
| `prisma/schema.prisma` | Database models |
| `worker/src/db.ts` | Prisma client for the worker process |
| `worker/src/logger.ts` | Pino logger for the worker process |
| `worker/src/worker.ts` | Slim orchestrator — boots all workers, handles graceful shutdown |
| `worker/src/workers/example.worker.ts` | Placeholder worker — delete and replace with real domain workers |
| `worker/src/workers/pdf.worker.ts` | PDF generation worker — `concurrency: 1`, uses Playwright adapter |
| `worker/src/workers/email.worker.ts` | Email delivery worker — 5 retries, exponential backoff, DLQ copy on exhaustion |
| `worker/src/workers/stripe-webhook.worker.ts` | Stripe event processor — handles 4 lifecycle events |
| `worker/src/adapters/playwright.ts` | Pluggable headless Chromium adapter — `generatePdf()`, `takeScreenshot()`, `withPage()` |
| `worker/src/queues.ts` | Canonical queue name registry (worker side — must mirror `src/lib/queue.ts`) |
| `deploy/nginx/foundry.conf.template` | Nginx config template — copy, replace `{{APP_DOMAIN}}` + `{{APP_PORT}}`, enable via symlink |
| `deploy/nginx/README.md` | Full Nginx deployment guide — port registry, Certbot, rollback |
| `docs/foundry-action-plan.md` | Full implementation status and architecture decisions |




