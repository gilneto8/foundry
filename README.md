# 🏭 The Foundry (Boilerplate)

Welcome to **The Foundry**, a high-performance SaaS manufacturing line designed for a single Hetzner VPS (AMD EPYC, 16GB RAM). This boilerplate is optimized for rapid deployment of B2B utility applications with a focus on resource efficiency and low server overhead.

## 🛠️ Tech Stack
- **Framework**: [Next.js 16.2.1](https://nextjs.org) (App Router, Turbopack)
- **Runtime**: [React 19](https://react.dev)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com) (Utility-first, Zero-config)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com) (Nova Preset, Radix UI)
- **Database**: [Prisma 7.6.0](https://www.prisma.io) (PostgreSQL, Adapter-based runtime)
- **Authentication**: Custom [jose](https://github.com/panva/jose) JWT + [argon2](https://github.com/ranisalt/node-argon2) (Stateless, HttpOnly cookies)
- **DevOps**: Docker Standalone Output (Target: <150MB images)
- **Language**: [TypeScript 5](https://typescriptlang.org)

## 🚀 Development Workflow

To start developing in the factory:

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Setup**:
    Copy `.env.example` to `.env` and configure your `DATABASE_URL` (PostgreSQL) and `SESSION_SECRET`.
    ```bash
    cp .env.example .env
    ```

3.  **Database Migration**:
    Initialize your local database schema.
    ```bash
    npx prisma migrate dev
    ```

4.  **Run Development Server**:
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) to see the result.

## 🐳 Dockerization (Production)

To simulate or run the production environment locally:

1.  **Build and Start**:
    ```bash
    docker compose up --build -d
    ```
    This starts the Next.js standalone server and a PostgreSQL 16 container.

2.  **Apply Migrations** (from the host — NOT inside the container):
    ```bash
    DATABASE_URL="postgresql://foundry:foundry_secret@localhost:5432/foundry" npx prisma migrate deploy
    ```
    The runner image is stripped to the bare minimum. Prisma CLI runs from your host `node_modules`.

## 🔍 Search & AI Optimization (SEO/AEO)

The boilerplate is pre-configured with best-in-class SEO and AEO (AI Engine Optimization) to ensure visibility in both Google and LLM crawlers (like Perplexity or OpenAI).

- **Global Metadata**: Configure base URLs and social primitives in `src/app/layout.tsx`.
- **Dynamic Robots**: Managed via `src/app/robots.ts`. Optimizes for crawling vs. indexing.
- **Sitemap**: Dynamic generation at `src/app/sitemap.ts`.
- **Semantic HTML**: UI components in `src/components/` follow high-density ARIA and semantic tagging for better LLM parsing.

To update for your product:
1. Set `NEXT_PUBLIC_APP_URL` in your `.env`.
2. Update `metadata` titles and OpenGraph images in `src/app/layout.tsx`.

## 📈 Current Progress

We have completed **Epic 1** (The Core Boilerplate). All foundational infrastructure is in place.

- [x] **Story 1.1**: Next.js + Tailwind + shadcn/ui Baseline
- [x] **Story 1.2**: Authentication & Database (Prisma 7 + Custom Auth)
- [x] **Story 1.3**: Dockerization & Artifact Shrinking (Standalone build)
- [ ] **Epic 2**: The Heavy Lifter (Background Workers with BullMQ) — **UP NEXT**

## 📁 Key Files

- `src/lib/session.ts`: JWT encryption and cookie handling.
- `src/lib/db.ts`: Prisma 7 singleton with `PrismaPg` adapter.
- `src/proxy.ts`: Next.js 16 route protection and auth middleware.
- `src/app/actions/auth.ts`: Signup, Login, and Logout logic.
- `docs/foundry-action-plan.md`: The official source of truth for implementation status.

---

**Built by Antigravity (Principal Foundry Engineer)**
