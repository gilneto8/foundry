// ============================================================
// src/lib/queue.ts
// BullMQ Queue client for the Next.js app.
//
// Use this to enqueue background jobs from Server Actions,
// API routes, or Route Handlers.
//
// The queue names MUST match the ones the worker is listening on.
// See: worker/src/queues.ts
// ============================================================

import "server-only";
import { Queue, type ConnectionOptions } from "bullmq";

// ---------------------------------------------------------------------------
// Queue name registry — keep in sync with worker/src/queues.ts
// ---------------------------------------------------------------------------
export const QUEUES = {
  EXAMPLE: "example",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// ---------------------------------------------------------------------------
// Redis connection
// Lazily parsed at first use — safe during Next.js build time.
// ---------------------------------------------------------------------------
function getConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("[queue] REDIS_URL environment variable is not set.");
  }
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
    db: parsed.pathname && parsed.pathname !== "/" ? parseInt(parsed.pathname.slice(1), 10) : 0,
  };
}

// ---------------------------------------------------------------------------
// Queue singleton map — one Queue instance per queue name
// ---------------------------------------------------------------------------
const queues = new Map<string, Queue>();

function getQueue(name: QueueName): Queue {
  if (!queues.has(name)) {
    queues.set(name, new Queue(name, { connection: getConnection() }));
  }
  return queues.get(name)!;
}

// ---------------------------------------------------------------------------
// Public API
//
// Usage in a Server Action:
//   import { enqueue, QUEUES } from "@/lib/queue";
//   await enqueue(QUEUES.EXAMPLE, { userId: "123", action: "welcome_email" });
// ---------------------------------------------------------------------------

/**
 * Enqueue a job on the specified queue.
 * @param queue  - The target queue name (use QUEUES constants)
 * @param data   - Typed payload for the job
 * @param opts   - Optional BullMQ job options (delay, retries, etc.)
 */
export async function enqueue<T extends object>(
  queue: QueueName,
  data: T,
  opts?: { delay?: number; attempts?: number; jobId?: string }
) {
  const q = getQueue(queue);
  const job = await q.add(queue, data, {
    attempts: opts?.attempts ?? 3,
    backoff: { type: "exponential", delay: 1000 },
    delay: opts?.delay,
    jobId: opts?.jobId,
  });
  return job;
}
