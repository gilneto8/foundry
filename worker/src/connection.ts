// ============================================================
// worker/src/connection.ts
// Shared Redis connection factory for BullMQ.
// ============================================================

import { type ConnectionOptions } from "bullmq";

/**
 * Returns a BullMQ-compatible Redis connection config.
 * Reads REDIS_URL from the environment and parses it.
 *
 * REDIS_URL format: redis://[:password@]host:port[/db]
 */
export function getRedisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("[worker] REDIS_URL environment variable is not set.");
  }

  const parsed = new URL(url);

  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
    db: parsed.pathname && parsed.pathname !== "/" ? parseInt(parsed.pathname.slice(1), 10) : 0,
  };
}
