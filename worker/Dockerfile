# ============================================================
# Foundry Worker — Dockerfile
# Standalone Node.js process for BullMQ job execution
# ============================================================

FROM node:24.13.0-alpine AS deps

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json package-lock.json* ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ============================================================
# Build — Compile TypeScript to CommonJS
# ============================================================
FROM node:24.13.0-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ============================================================
# Runner — Minimal production image
# ============================================================
FROM node:24.13.0-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production

# Only keep production dependencies and compiled output
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN addgroup -g 1001 -S worker && adduser -S -u 1001 -G worker worker
RUN chown -R worker:worker /app
USER worker

CMD ["node", "dist/worker.js"]
