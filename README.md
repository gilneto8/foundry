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
| Containers | Docker — multi-stage Alpine build |
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

Background jobs let you offload heavy operations (PDF generation, email sending, data processing) away from the Next.js request cycle. The infrastructure is already running — you just need to wire in your logic.

#### There are two files to edit every time you add a new job type:

---

**File 1: `src/lib/queue.ts`** (the Next.js side — enqueues jobs)

Add your new queue to the `QUEUES` constant:

```ts
export const QUEUES = {
  EXAMPLE: "example",       // ← keep or delete this placeholder
  SEND_EMAIL: "send_email", // ← your new queue
  GENERATE_PDF: "generate_pdf",
} as const;
```

Then call `enqueue()` from any Server Action or API route:

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
  data: object,           // any serializable payload — this is what the worker receives
  opts?: {
    delay?: number,       // delay in ms before the job is executed
    attempts?: number,    // override default of 3 retries
    jobId?: string,       // set a deterministic ID to prevent duplicate jobs
  }
)
```

---

**File 2: `worker/src/worker.ts`** (the worker side — processes jobs)

Add a new `Worker` instance for each queue:

```ts
import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "./connection";
import { QUEUES } from "./queues";

const connection = getRedisConnection();

// --- Your new worker ---
const emailWorker = new Worker(
  QUEUES.SEND_EMAIL,
  async (job: Job) => {
    const { userId, email, template } = job.data;

    // Your actual logic here — call Resend, Brevo, NodeMailer, etc.
    await sendTransactionalEmail({ to: email, template });

    return { sent: true };
  },
  {
    connection,
    concurrency: 10, // How many jobs to run in parallel — tune to your VPS RAM
  }
);

emailWorker.on("completed", (job) => console.log(`[email] ✓ ${job.id}`));
emailWorker.on("failed", (job, err) => console.error(`[email] ✗ ${job?.id}`, err.message));
```

Also add the queue name to **`worker/src/queues.ts`** to keep both sides in sync:

```ts
export const QUEUES = {
  EXAMPLE: "example",
  SEND_EMAIL: "send_email",
  GENERATE_PDF: "generate_pdf",
} as const;
```

> ⚠️ **Both `QUEUES` objects must stay in sync.** If the name in `src/lib/queue.ts` and `worker/src/queues.ts` don't match exactly, jobs will be enqueued but never consumed.

After editing the worker, rebuild and restart it:

```bash
docker compose build worker && docker compose up -d worker
```

---

### Step 5 — Add New Pages and Routes

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

### Step 6 — Configure SEO & AI Metadata

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

### Step 7 — Environment Variables Checklist

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
| `src/proxy.ts` | Route protection middleware (Next.js 16: `proxy.ts`, not `middleware.ts`) |
| `src/app/actions/auth.ts` | Signup, Login, Logout Server Actions |
| `src/app/layout.tsx` | Root metadata — SEO, OpenGraph, Twitter cards |
| `src/app/robots.ts` | Robots.txt — crawler access control |
| `src/app/sitemap.ts` | Dynamic XML sitemap |
| `prisma/schema.prisma` | Database models |
| `worker/src/worker.ts` | BullMQ job processors — one Worker per queue |
| `worker/src/queues.ts` | Canonical queue name registry (worker side) |
| `docs/foundry-action-plan.md` | Full implementation status and architecture decisions |



