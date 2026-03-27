# ============================================================
# Foundry — Multi-Stage Dockerfile
# Target: Node.js 24 slim — optimized for standalone Next.js
# ============================================================

ARG NODE_VERSION=24.13.0-alpine

# ============================================================
# Stage 1 — deps: Install all dependencies
# ============================================================
FROM node:${NODE_VERSION} AS deps

# Ensure dependencies for native modules (argon2, prisma) are present
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ============================================================
# Stage 2 — builder: Compile the Next.js standalone output
# ============================================================
FROM node:${NODE_VERSION} AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npx prisma generate
RUN npm run build

# ============================================================
# Stage 3 — runner: Minimal production image
# ============================================================
FROM node:${NODE_VERSION} AS runner

# Required for some native modules on musl
RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN mkdir -p .next && chown -R node:node /app

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

CMD ["node", "server.js"]
