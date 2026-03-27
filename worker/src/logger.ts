// ============================================================
// worker/src/logger.ts
// Centralised Pino logger for the BullMQ worker process.
//
// Identical design to src/lib/logger.ts but for the worker.
// `service: "foundry-worker"` differentiates it in Loki from
// the Next.js app (`foundry-app`), even if they're on the same host.
//
// In Docker: stdout → json-file driver → Promtail picks it up
// automatically via docker_sd_configs on the VPS.
//
// USAGE:
//   import { logger } from "./logger";
//   const log = logger.child({ module: "pdf" });
//   log.info({ jobId: job.id, url }, "Rendering PDF");
// ============================================================

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),

  base: {
    service: "foundry-worker",
    env: process.env.NODE_ENV ?? "development",
  },

  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss",
        ignore: "pid,hostname,env",
      },
    },
  }),
});
