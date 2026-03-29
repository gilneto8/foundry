// ============================================================
// src/lib/deadline.ts
// Holiday-aware business-day deadline calculator.
//
// DESIGN:
//   This is a pure computation module — no DB reads, no side effects.
//   All async work is delegated to holidays.ts (the Redis cache layer).
//
// PRIMARY USE CASE — Tacit Approval (Deferimento Tácito):
//   Under the Portuguese Simplex Urbanístico (Decree-Law 10/2024),
//   municipalities must respond to urban licensing requests within:
//     - 120 business days for standard operations
//     - 200 business days for complex/large-scale operations
//   If they remain silent past the deadline, tacit approval is granted.
//
// SECONDARY USE CASES (same engine, different daysAllowed):
//   - IRC asset disposal 15-day notifier (item 20)
//   - QES e-invoice stamping deadline tracking (item 15)
//   - Any statutory timeframe with a calendar or business-day clock
//
// USAGE:
//   import { calculateDeadline } from "@/lib/deadline";
//
//   const result = await calculateDeadline({
//     submissionDate: new Date("2026-01-15"),
//     daysAllowed: 120,
//     municipalityCode: "1106",
//     dayType: "business",
//   });
//   // result.legalDeadline  → exact Date when deadline expires
//   // result.isExpired      → true if today is past legalDeadline
//   // result.warningDate    → Date to send the 10-day reminder email
// ============================================================

import "server-only";
import { isBusinessDay, getAllHolidays, toDateString } from "@/lib/holidays";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "deadline" });

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Project classification under Simplex Urbanístico. */
export type ProjectClass = "standard" | "complex";

/** Statutory days allowed per classification. */
export const SIMPLEX_DAYS: Record<ProjectClass, number> = {
  standard: 120,
  complex: 200,
} as const;

export interface DeadlineConfig {
  /** The date the submission was filed with the municipality. */
  submissionDate: Date;
  /**
   * Number of days the authority has to respond.
   * For Simplex Urbanístico: use SIMPLEX_DAYS.standard or SIMPLEX_DAYS.complex.
   * For other use cases: pass any positive integer.
   */
  daysAllowed: number;
  /**
   * INE municipality code for the authority receiving the submission.
   * Used to exclude both national and local public holidays.
   * e.g. "1106" for Lisboa, "1309" for Porto.
   */
  municipalityCode: string;
  /**
   * Whether the daysAllowed count skips weekends and public holidays.
   *   "business" — Portuguese Simplex standard (most use cases here)
   *   "calendar" — rare; some statutory deadlines count all days
   */
  dayType: "business" | "calendar";
}

export interface DeadlineResult {
  /** The exact Date the legal deadline expires (last valid day for authority response). */
  legalDeadline: Date;
  /**
   * ISO date string of legalDeadline (YYYY-MM-DD).
   * Stable for display and storage without timezone complications.
   */
  legalDeadlineStr: string;
  /** Calendar days from today until the legalDeadline. Negative means expired. */
  calendarDaysRemaining: number;
  /** Business days from today until legalDeadline. Negative means expired. */
  businessDaysRemaining: number;
  /** True if today is on or past legalDeadline. */
  isExpired: boolean;
  /**
   * The Date when tacit approval becomes claimable.
   * Equals legalDeadline + 1 business day (the following business day after expiry).
   * Relevant only for Simplex Urbanístico use case.
   */
  tacitApprovalEligibleAt: Date;
  tacitApprovalEligibleAtStr: string;
  /**
   * The Date to send the 10-business-day warning notification.
   * This is 10 business days before legalDeadline.
   */
  warningDate: Date;
  warningDateStr: string;
  /** True if today has reached or passed the warningDate. */
  isInWarningPeriod: boolean;
  /** The input config echoed back for logging/audit. */
  config: DeadlineConfig;
}

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------

/**
 * Calculates the legal response deadline for a municipal submission,
 * correctly accounting for Portuguese national and municipal public holidays.
 *
 * @throws if daysAllowed < 1 or municipalityCode is empty.
 */
export async function calculateDeadline(config: DeadlineConfig): Promise<DeadlineResult> {
  const { submissionDate, daysAllowed, municipalityCode, dayType } = config;

  if (daysAllowed < 1) throw new Error("[deadline] daysAllowed must be a positive integer.");
  if (!municipalityCode) throw new Error("[deadline] municipalityCode is required.");

  const start = stripTime(submissionDate);
  const today = stripTime(new Date());

  log.debug(
    { submissionDate: toDateString(start), daysAllowed, municipalityCode, dayType },
    "Calculating deadline"
  );

  // --- Step 1: Walk forward from submission date to find legal deadline ---
  const legalDeadline = await addDays(start, daysAllowed, municipalityCode, dayType);

  // --- Step 2: Warning date = legalDeadline minus 10 business days ---
  const warningDate = await subtractDays(legalDeadline, 10, municipalityCode, "business");

  // --- Step 3: Tacit approval eligible = next business day after deadline ---
  const tacitApprovalEligibleAt = await addDays(legalDeadline, 1, municipalityCode, "business");

  // --- Step 4: Compute remaining days from today ---
  const calendarDaysRemaining = diffCalendarDays(today, legalDeadline);
  const businessDaysRemaining = await diffBusinessDays(today, legalDeadline, municipalityCode);

  const isExpired = today >= legalDeadline;
  const isInWarningPeriod = today >= warningDate && !isExpired;

  const result: DeadlineResult = {
    legalDeadline,
    legalDeadlineStr: toDateString(legalDeadline),
    calendarDaysRemaining,
    businessDaysRemaining,
    isExpired,
    tacitApprovalEligibleAt,
    tacitApprovalEligibleAtStr: toDateString(tacitApprovalEligibleAt),
    warningDate,
    warningDateStr: toDateString(warningDate),
    isInWarningPeriod,
    config,
  };

  log.info(
    {
      event: "deadline.calculated",
      legalDeadline: result.legalDeadlineStr,
      businessDaysRemaining,
      isExpired,
      isInWarningPeriod,
      municipalityCode,
    },
    "Deadline calculated"
  );

  return result;
}

// ---------------------------------------------------------------------------
// Convenience wrapper — Simplex Urbanístico specific
// ---------------------------------------------------------------------------

/**
 * Shorthand for calculating a Simplex Urbanístico tacit approval deadline.
 * Automatically selects the correct daysAllowed based on project class.
 */
export async function calculateSimplexDeadline(
  submissionDate: Date,
  municipalityCode: string,
  projectClass: ProjectClass = "standard"
): Promise<DeadlineResult> {
  return calculateDeadline({
    submissionDate,
    daysAllowed: SIMPLEX_DAYS[projectClass],
    municipalityCode,
    dayType: "business",
  });
}

// ---------------------------------------------------------------------------
// Date arithmetic helpers (internal — not exported)
// ---------------------------------------------------------------------------

/** Returns a new Date with the time component zeroed (midnight UTC). */
function stripTime(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/** Advances a date by one calendar day. */
function nextDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** Moves a date back by one calendar day. */
function prevDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/**
 * Returns the difference in calendar days between two dates.
 * Positive if `to` is in the future relative to `from`.
 */
function diffCalendarDays(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

/**
 * Adds N days to a start date, skipping weekends/holidays if dayType is "business".
 * The start date itself is NOT counted — counting begins the next day.
 * This matches Portuguese administrative law convention.
 */
async function addDays(
  start: Date,
  n: number,
  municipalityCode: string,
  dayType: "business" | "calendar"
): Promise<Date> {
  if (dayType === "calendar") {
    const result = new Date(start);
    result.setUTCDate(result.getUTCDate() + n);
    return result;
  }

  // Prefetch holidays for the relevant years (start year + 1 year ahead)
  const startYear = start.getFullYear();
  await getAllHolidays(municipalityCode, startYear);
  await getAllHolidays(municipalityCode, startYear + 1);

  let current = start;
  let counted = 0;

  while (counted < n) {
    current = nextDay(current);
    if (await isBusinessDay(current, municipalityCode)) {
      counted++;
    }
  }

  return current;
}

/**
 * Subtracts N business days from a date.
 * Used to calculate the warning date (legalDeadline - 10 business days).
 */
async function subtractDays(
  from: Date,
  n: number,
  municipalityCode: string,
  dayType: "business" | "calendar"
): Promise<Date> {
  if (dayType === "calendar") {
    const result = new Date(from);
    result.setUTCDate(result.getUTCDate() - n);
    return result;
  }

  let current = from;
  let counted = 0;

  while (counted < n) {
    current = prevDay(current);
    if (await isBusinessDay(current, municipalityCode)) {
      counted++;
    }
  }

  return current;
}

/**
 * Counts business days between two dates (inclusive of neither endpoint).
 * Returns a negative number if `to` is before `from`.
 */
export async function diffBusinessDays(
  from: Date,
  to: Date,
  municipalityCode: string
): Promise<number> {
  if (toDateString(from) === toDateString(to)) return 0;

  const forwards = from < to;
  let current = forwards ? from : to;
  const end = forwards ? to : from;
  let count = 0;

  while (current < end) {
    current = nextDay(current);
    if (await isBusinessDay(current, municipalityCode)) {
      count++;
    }
  }

  return forwards ? count : -count;
}

/**
 * Counts business days between two dates (from data.gov.pt integrated logic).
 *
 * Exported for use in future compliance products that need raw business-day
 * arithmetic without the full DeadlineResult wrapper.
 */
export async function getBusinessDaysBetween(
  start: Date,
  end: Date,
  municipalityCode: string
): Promise<number> {
  return diffBusinessDays(stripTime(start), stripTime(end), municipalityCode);
}
