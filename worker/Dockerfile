# ============================================================
# Foundry Worker — Dockerfile
# Standalone Node.js process for BullMQ job execution.
#
# Base: node:24-slim (Debian) — NOT Alpine.
# Reason: Playwright's bundled Chromium does not support Alpine's
# musl libc. Debian slim is the officially supported target.
#
# If your product does NOT use the Playwright adapter:
#   - Remove the Playwright install lines from the deps stage
#   - Remove the Chromium ENV vars
#   - Consider switching back to Alpine for a smaller image
# ============================================================

# ============================================================
# Stage 1 — deps: Install Node deps + Playwright Chromium
# ============================================================
FROM node:24.13.0-slim AS deps

WORKDIR /app

COPY package.json package-lock.json* ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# Tell Playwright where to install browsers — must be a known path so the
# runner stage can COPY it. Without this, it defaults to ~/.cache/ms-playwright.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Install Playwright's Chromium + all required OS-level dependencies.
# --with-deps handles: libnss3, libatk, libcups, libdrm, libgbm, etc.
# This is the canonical Playwright install method for production Docker.
RUN npx playwright install --with-deps chromium

# ============================================================
# Stage 2 — builder: Compile TypeScript to CommonJS
# ============================================================
FROM node:24.13.0-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ============================================================
# Stage 3 — runner: Production image
# ============================================================
FROM node:24.13.0-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Playwright browser path — must match where deps stage installed it
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Task 2.2.2 — Chromium launch flags for rootless container environments.
# These are baked in here as a fallback. The adapter also sets them in code.
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/ms-playwright/chromium-*/chrome-linux/chrome

# Copy compiled app + node_modules from build stages
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Copy Playwright browser binaries from deps stage
COPY --from=deps /ms-playwright /ms-playwright

# Install only the minimal OS libs required to run Chromium
# (just the runtime, not the dev headers — playwright install --with-deps
# in deps stage already set those up for the build environment)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libdbus-1-3 libxkbcommon0 libx11-6 libxcomposite1 libxdamage1 \
    libxext6 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Task 2.2.3 — Unprivileged user.
# Chromium requires --no-sandbox when running as root; we avoid that entirely
# by running as a non-root user, matching the adapter flags for defence in depth.
RUN addgroup --gid 1001 worker && adduser --uid 1001 --gid 1001 --disabled-password --gecos "" worker
RUN chown -R worker:worker /app /ms-playwright
USER worker

CMD ["node", "dist/worker.js"]

