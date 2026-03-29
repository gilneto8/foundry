// ============================================================
// worker/src/adapters/sms.ts
// SMS channel adapter — Vonage (formerly Nexmo).
//
// WHY VONAGE:
//   - Better delivery rates on Portuguese mobile networks than Twilio
//   - Native PT local number pool available
//   - Cheaper per-SMS for European E.164 numbers
//
// CONFIGURATION (.env):
//   VONAGE_API_KEY    — from https://dashboard.nexmo.com/
//   VONAGE_API_SECRET — from https://dashboard.nexmo.com/
//   VONAGE_FROM       — Sender ID or virtual number (e.g. "AlertaAT" or "+351...")
//                       Note: alphanumeric sender IDs are not supported in all countries.
//                       For PT: a virtual number is more reliable than a name.
//
// USAGE:
//   import { sendSmsDirect } from "../adapters/sms";
//   await sendSmsDirect({ to: "+351912345678", body: "Alerta: ..." });
//
// SWAP GUIDE:
//   To replace Vonage with Twilio, implement the same SmsChannelPayload
//   interface using the Twilio SDK and update VONAGE_* env vars to TWILIO_*.
//   The notification adapter and worker require zero changes.
// ============================================================

import { logger } from "../logger";

const log = logger.child({ module: "adapter.sms" });

export interface SmsChannelPayload {
  /** E.164 format: +351912345678 */
  to: string;
  /** Plain text only — no HTML. Max 160 chars per SMS segment. */
  body: string;
}

// ---------------------------------------------------------------------------
// Vonage REST API — using the low-level fetch approach to avoid adding the
// full @vonage/server-sdk package (heavy dep). The SMS API is a single
// POST endpoint and requires no SDK.
// ---------------------------------------------------------------------------
const VONAGE_SMS_API = "https://rest.nexmo.com/sms/json";

function getVonageConfig(): { apiKey: string; apiSecret: string; from: string } {
  const apiKey = process.env.VONAGE_API_KEY;
  const apiSecret = process.env.VONAGE_API_SECRET;
  const from = process.env.VONAGE_FROM;

  if (!apiKey || !apiSecret || !from) {
    throw new Error(
      "[adapter.sms] Missing Vonage config. Set VONAGE_API_KEY, VONAGE_API_SECRET, VONAGE_FROM."
    );
  }

  return { apiKey, apiSecret, from };
}

// ---------------------------------------------------------------------------
// Vonage API response type (subset)
// ---------------------------------------------------------------------------
interface VonageResponse {
  messages: Array<{
    status: string; // "0" = success
    "error-text"?: string;
    "message-id"?: string;
    "remaining-balance"?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Primary export
// ---------------------------------------------------------------------------

/**
 * Sends an SMS via the Vonage REST API. Throws on failure — let the caller
 * (worker) handle retries via BullMQ.
 */
export async function sendSmsDirect(payload: SmsChannelPayload): Promise<void> {
  const { apiKey, apiSecret, from } = getVonageConfig();

  const body = new URLSearchParams({
    api_key: apiKey,
    api_secret: apiSecret,
    to: payload.to,
    from,
    text: payload.body,
    type: "text",
  });

  const res = await fetch(VONAGE_SMS_API, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`[adapter.sms] Vonage HTTP error: ${res.status} ${res.statusText}`);
  }

  const data: VonageResponse = await res.json();
  const message = data.messages?.[0];

  if (!message || message.status !== "0") {
    throw new Error(
      `[adapter.sms] Vonage delivery error: ${message?.["error-text"] ?? "unknown"} (status ${message?.status})`
    );
  }

  log.info(
    {
      event: "sms.sent",
      messageId: message["message-id"],
      remainingBalance: message["remaining-balance"],
    },
    "SMS sent"
  );
}
