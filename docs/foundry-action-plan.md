# 🏭 The Foundry: Boilerplate Action Plan (0 to 1)

**Owner**: Principal Foundry Engineer
**Objective**: Build "The God Boilerplate" — A ruthlessly efficient, zero-bloat Next.js SaaS manufacturing line optimized for a single Hetzner VPS (AMD EPYC, 16GB RAM). 

This is the source of truth for the boilerplate architecture. Check off tasks as they are completed `[x]`. If an agent is summoned, point them to the exact Epic/Story/Task they need to execute.

---

## Epic 1: The Core Boilerplate (Next.js Framework)
**Goal:** Establish a standardized web application chassis using Next.js App Router, strictly enforcing hyper-optimized artifact outputs to keep Docker images under 150MB.

### Story 1.1: Next.js + Tailwind + shadcn/ui Baseline
*As a founder, I want a clean, fully-typed Next.js template so I don't waste time scaffolding UI components.*
- [ ] **Task 1.1.1**: Initialize Next.js 15+ template (`npx create-next-app@latest`) with TypeScript, ESLint, App Router, PostCSS, and strictly configure Tailwind CSS.
- [ ] **Task 1.1.2**: Install and configure `shadcn/ui` with Tailwind-based standard layout variables.
- [ ] **Task 1.1.3**: Build standard boilerplate layout components (Header, Sidebar Navigation, Container bounds, Footer).
- [ ] **Task 1.1.4**: Strip out default Next.js boilerplate CSS and standardize `globals.css` ensuring Tailwind directives are properly loaded.

### Story 1.2: Authentication & Database Wiring
*As a founder, I want out-of-the-box user auth and data persistence so new B2B tools can securely track user sessions instantly.*
- [ ] **Task 1.2.1**: Set up strictly typed Prisma ORM and generate schema templates for multi-tenant management.
- [ ] **Task 1.2.2**: Provision a PostgreSQL schema pattern that isolates localized app data perfectly.
- [ ] **Task 1.2.3**: Configure `NextAuth.js` (Auth.js) with generic Email/Password protocols and OAuth (Google) providers.
- [ ] **Task 1.2.4**: Create a Next.js `middleware.ts` (root-level, not `proxy.ts`) to intercept and securely validate session tokens for protected routes.

### Story 1.3: Dockerization & Artifact Shrinking
*As a DevOps Engineer, I want the build pipeline to prune unused dependencies so the VPS can hold dozens of isolated apps without crashing.*
- [ ] **Task 1.3.1**: Explicitly declare `output: 'standalone'` in `next.config.js`.
- [ ] **Task 1.3.2**: Write the multi-stage `Dockerfile` (Node 18 Alpine) configured to strictly capture the `.next/standalone` folder.
- [ ] **Task 1.3.3**: Lock all non-essential read/write operations for the Node user (`uid 1001`).
- [ ] **Task 1.3.4**: Write `docker-compose.yml` base skeleton to orchestrate Next.js + Postgres. Test local build to confirm image size is <150MB.

---

## Epic 2: The Heavy Lifter (Background Workers)
**Goal:** Protect the Hetzner core server from RAM crashes when executing memory-intensive operations like generating legal PDFs and parsing CSVs.

### Story 2.1: Implement Redis + BullMQ Infrastructure
*As a System Architect, I want heavy operations isolated from the Next.js main thread so user experiences remain lightning-fast.*
- [ ] **Task 2.1.1**: Set up a baseline Redis container configuration in the global `docker-compose.yml`.
- [ ] **Task 2.1.2**: Initialize a separate Node/TS generic Worker directory dedicated to background job processing using `bullmq`.
- [ ] **Task 2.1.3**: Build the typed `lib/queue.ts` within the Next.js boilerplate to easily publish payload events to Redis.

### Story 2.2: PDF Generator Worker Node
*As a founder building Auto de Vistoria and AL Livro apps, I want a bulletproof headless PDF engine.*
- [ ] **Task 2.2.1**: Implement a Playwright/Puppeteer script natively inside the BullMQ worker.
- [ ] **Task 2.2.2**: Optimize headless Chromium launch flags (`--no-sandbox`, `--disable-dev-shm-usage`) inside the Worker's `Dockerfile`.
- [ ] **Task 2.2.3**: Mandate strict worker concurrency limits to eliminate risk of VPS memory exhaustion.

---

## Epic 3: The Observation Layer
**Goal:** Achieve zero-config, highly-structured telemetry across all factory deployments.

### Story 3.1: Centralized JSON Logging
*As a SysAdmin, I need perfectly structured JSON logs so scraping agents can parse them dynamically.*
- [ ] **Task 3.1.1**: Implement a custom wrapper `lib/logger.ts` (using Pino or Winston) to replace global `console` events.
- [ ] **Task 3.1.2**: Inject the logger into Next.js middleware, global API error boundaries, and React rendering boundaries.

### Story 3.2: Integration with Existing GLP Stack (Grafana, Loki, Promtail)
*As a founder, since my Hetzner VPS already runs the GLP stack globally, I want the new boilerplate to automatically hook into this existing infrastructure.*
- [ ] **Task 3.2.1**: Ensure boilerplate Docker containers emit standard JSON logs directly to the Docker engine, avoiding isolated PM2 where possible.
- [ ] **Task 3.2.2**: Validate that the existing global Promtail `docker_sd_configs` (which dynamically maps `__meta_docker_container_name` to the `app` label) naturally picks up the new factory containers without custom Promtail configuration.
- [ ] **Task 3.2.3**: Build new Grafana Dashboards utilizing the existing Loki data source, specifically tracking the new boilerplate's RAM, CPU spikes, and `500` error rates.

---

## Epic 4: The Traffic Cop (Nginx Reverse Proxy)
**Goal:** Route localized domains safely and seamlessly without manual intervention errors.

### Story 4.1: Seamless Nginx Domain Routing
*As a SysAdmin, since Nginx is already routing live sites (alerta-at.pt, kelaro.io, gil-neto.com), I want a foolproof template to expose new Docker instances without breaking existing configurations.*
- [ ] **Task 4.1.1**: Create a standardized Nginx `.conf` template specifically for the foundry boilerplate that proxies `app.new-domain.com` to the correct internal Docker port (e.g., `3000`).
- [ ] **Task 4.1.2**: Document the strict deployment step to safely duplicate the template into `/etc/nginx/sites-available` and symlink to `sites-enabled` via `ln -s`.
- [ ] **Task 4.1.3**: Validate existing Certbot installations and append new domains via standard `certbot --nginx -d app.new-domain.com` without dropping existing SSL certificates or restarting Nginx forcefully during peak hours.

---

## Epic 5: The Outbound Engine
**Goal:** Build automated lead generation tools feeding the initial localized SaaS products.

### Story 5.1: Python Scraper Utility
*As a Marketer, I need an isolated background scraper pulling from Portuguese Google Maps directories.*
- [ ] **Task 5.1.1**: Scaffold a lightweight Alpine Python Docker container.
- [ ] **Task 5.1.2**: Write headless scraping logic aimed specifically at real estate agencies, restaurants, and transport fleets within Portugal.
- [ ] **Task 5.1.3**: Persist cleaned records to a centralized PostgreSQL table or auto-generate structured CSV exports.

---

## Epic 6: Administrative Scripts & Risk Guardrails
**Goal:** Enable ruthless pruning and lifecycle management for the 60-day product validation windows.

### Story 6.1: The 60-Day 'Kill Switch' Protocol
*As a pragmatic founder, I need a safe and fast way to wipe unviable projects from my server so I don't incur maintenance tax on zero-MRR tools.*
- [ ] **Task 6.1.1**: Develop `teardown.sh` script to delete specific Docker images, kill containers, and remove Nginx configurations dynamically.
- [ ] **Task 6.1.2**: Automate a pre-kill SQLite/PosgreSQL database snapshot that uploads the backup to a cheap S3-compatible bucket (e.g., Cloudflare R2) just before total project wipe.
