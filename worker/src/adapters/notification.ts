// ============================================================
// worker/src/adapters/notification.ts
// Notification channel dispatcher.
//
// DESIGN:
//   This is the single place that decides which adapter to call
//   based on the channel field. All channel-specific logic lives
//   in the individual adapters (email.ts, sms.ts). Adding a new
//   channel (e.g. webhook, WhatsApp) means:
//     1. Create worker/src/adapters/<channel>.ts
//     2. Add a case here
//     3. Add the channel type to NotificationChannel
//
// USAGE (from notification.worker.ts):
//   import { dispatchNotification } from "../adapters/notification";
//   await dispatchNotification(job.data);
// ============================================================

import { sendEmailDirect, type EmailChannelPayload } from "./email";
import { sendSmsDirect, type SmsChannelPayload } from "./sms";
import { logger } from "../logger";

const log = logger.child({ module: "adapter.notification" });

// ---------------------------------------------------------------------------
// Unified channel type — extend here when adding new channels
// ---------------------------------------------------------------------------
export type NotificationChannel = "email" | "sms";

// ---------------------------------------------------------------------------
// Discriminated union payload — each channel has its own required fields
// ---------------------------------------------------------------------------
export type NotificationPayload =
  | ({
      channel: "email";
    } & EmailChannelPayload)
  | ({
      channel: "sms";
      /** E.164 phone number */
      to: string;
      /** Plain text content */
      body: string;
    } & Omit<SmsChannelPayload, "to">);

// ---------------------------------------------------------------------------
// Dispatcher — the only function callers need
// ---------------------------------------------------------------------------

/**
 * Routes a notification payload to the correct channel adapter.
 * Throws on failure — retry logic is handled by the BullMQ worker.
 */
export async function dispatchNotification(payload: NotificationPayload): Promise<void> {
  log.info(
    { event: "notification.dispatch", channel: payload.channel },
    "Dispatching notification"
  );

  switch (payload.channel) {
    case "email":
      await sendEmailDirect(payload);
      break;

    case "sms":
      await sendSmsDirect({ to: payload.to, body: payload.body });
      break;

    default: {
      // TypeScript exhaustiveness check — this line is unreachable if all
      // channels in NotificationChannel are handled above.
      const _exhaustive: never = payload;
      throw new Error(`[notification] Unknown channel in payload: ${JSON.stringify(_exhaustive)}`);
    }
  }

  log.info(
    { event: "notification.dispatched", channel: payload.channel },
    "Notification dispatched successfully"
  );
}
