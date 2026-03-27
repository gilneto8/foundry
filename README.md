# 🏭 The Foundry (Boilerplate)

Welcome to **The Foundry**, a high-performance SaaS manufacturing line designed for a single Hetzner VPS (AMD EPYC, 16GB RAM). This boilerplate is optimized for rapid deployment of B2B utility applications with a focus on resource efficiency and low server overhead.

## 🛠️ Tech Stack
- **Framework**: [Next.js 16.2.1](https://nextjs.org) (App Router, Turbopack)
- **Runtime**: [React 19](https://react.dev)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com) (Utility-first, Zero-config)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com) (Nova Preset, Radix UI)
- **DevOps**: Docker Standalone Output (Target: <150MB images)
- **Language**: [TypeScript 5](https://typescriptlang.org)

## 🚀 Getting Started

To see the current state of the manufacturing line:

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Development Server**:
   ```bash
   npm run dev
   ```

3. **Visualize**:
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📈 Current Progress

We are currently following a structured implementation path. See the [Foundry Action Plan](docs/foundry-action-plan.md) for the full status of all epics and stories.

- [x] **Story 1.1**: Next.js + Tailwind + shadcn/ui Baseline
- [ ] **Story 1.2**: Authentication & Database Wiring (Next Up)
- [ ] **Story 1.3**: Dockerization & Artifact Shrinking

## 📁 Key Components & Structure

- `src/components/layout/`: Shared shell components (`AppHeader`, `AppSidebar`, `AppShell`).
- `src/components/ui/`: Atomic UI components from shadcn/ui.
- `src/app/globals.css`: Tailwind v4 entry point with `oklch` theme tokens.
- `docs/`: Strategic planning and execution roadmaps.

---

**Built by Antigravity (Principal Foundry Engineer)**
