// ============================================================
// src/lib/logger.ts
// Centralised Pino logger for the Next.js application.
//
// DESIGN:
//   - Writes structured JSON to stdout (production)
//   - Pretty-prints to stdout (development, via pino-pretty)
//   - Docker captures stdout and writes it to the json-file log driver
//   - Promtail reads those files and ships them to Loki
//   - The `service` field identifies this instance in Grafana
//
// USAGE:
//   import { logger } from "@/lib/logger";
//
//   logger.info("Server started");
//   logger.info({ userId, path }, "Route accessed");
//   logger.error({ err }, "Something failed");
//
// CHILD LOGGERS — scope logs to a module:
//   const log = logger.child({ module: "auth" });
//   log.warn({ email }, "Login attempt with unknown email");
// ============================================================

import "server-only";
import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  // Log level — override via LOG_LEVEL env var
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),

  // Base fields attached to every log line
  // `service` is used in Grafana to filter by app within Loki
  base: {
    service: "foundry-app",
    env: process.env.NODE_ENV ?? "development",
  },

  // Redact sensitive fields before they hit stdout
  redact: {
    paths: ["*.password", "*.passwordHash", "*.token", "*.secret", "*.cookie"],
    censor: "[REDACTED]",
  },

  // In development: pretty terminal output
  // In production: raw JSON lines → Docker json-file → Promtail → Loki
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
