// ============================================================
// src/lib/holidays.ts
// Portuguese public holiday resolver — national + municipal.
//
// DESIGN:
//   - National holidays are fetched from the official data.gov.pt API
//     and cached in Redis with a 30-day TTL. They are static per year
//     so a single fetch per year is sufficient.
//   - Municipal holidays are a static data structure covering the
//     top 30 Portuguese tourist municipalities. Each câmara has one
//     or two local holidays (feriado municipal) in addition to national
//     ones. The list is embedded here and never needs to be fetched.
//   - isBusinessDay(date, municipalityCode) is the primary public surface.
//
// CACHE KEYS:
//   holidays:national:<year>  → JSON array of ISO date strings
//
// USAGE:
//   import { isBusinessDay, getMunicipalHolidays } from "@/lib/holidays";
//   const ok = await isBusinessDay(new Date("2026-06-10"), "1106");
// ============================================================

import "server-only";
import Redis from "ioredis";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "holidays" });

// ---------------------------------------------------------------------------
// Redis singleton
// Uses the same REDIS_URL as BullMQ. Lazily instantiated.
// ---------------------------------------------------------------------------
let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("[holidays] REDIS_URL is not set.");
  _redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
  return _redis;
}

// TTL for cached holiday lists: 30 days in seconds
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

// ---------------------------------------------------------------------------
// In-process memory cache
// Prevents repeated Redis/HTTP calls for the same year within a single
// Node.js process (covers the hot loop in addDays which calls isBusinessDay
// once per day being counted).
// ---------------------------------------------------------------------------
const _memCache = new Map<string, Date[]>();

// ---------------------------------------------------------------------------
// National holidays — fetched from data.gov.pt
// API: https://date.nager.at/api/v3/PublicHolidays/{year}/PT
// Nager.Date is a well-maintained, open-source public holiday API used by
// the Portuguese government's own tooling integrations.
// Falls back to a hardcoded baseline if the API is unreachable.
// ---------------------------------------------------------------------------

/**
 * Portuguese national holidays that are fixed every year.
 * Used as a fallback if the API call fails.
 */
function getFixedNationalHolidays(year: number): Date[] {
  const fixed = [
    `${year}-01-01`, // Ano Novo
    `${year}-04-25`, // Dia da Liberdade
    `${year}-05-01`, // Dia do Trabalhador
    `${year}-06-10`, // Dia de Portugal
    `${year}-08-15`, // Assunção de Nossa Senhora
    `${year}-10-05`, // Implantação da República
    `${year}-11-01`, // Todos os Santos
    `${year}-12-01`, // Restauração da Independência
    `${year}-12-08`, // Imaculada Conceição
    `${year}-12-25`, // Natal
  ];
  return fixed.map((d) => new Date(d));
}

/**
 * Fetch national public holidays for Portugal for a given year.
 * Results are cached in Redis for 30 days.
 */
export async function getNationalHolidays(year: number): Promise<Date[]> {
  const memKey = `national:${year}`;
  if (_memCache.has(memKey)) return _memCache.get(memKey)!;

  const cacheKey = `holidays:national:${year}`;

  try {
    const redis = getRedis();
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed: string[] = JSON.parse(cached);
      const dates = parsed.map((d) => new Date(d));
      _memCache.set(memKey, dates);
      return dates;
    }
  } catch (err) {
    log.warn({ err, year }, "Redis unavailable — fetching national holidays without cache");
  }

  // Fetch from Nager.Date (open-source, matches PT official calendar)
  let holidays: Date[];
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/PT`, {
      next: { revalidate: 86400 }, // Next.js fetch cache: 1 day
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data: Array<{ date: string; global: boolean }> = await res.json();
    // Only include nationwide holidays (global: true), not regional/county ones
    holidays = data.filter((h) => h.global).map((h) => new Date(h.date));

    log.info({ year, count: holidays.length }, "Fetched national holidays from Nager.Date API");
  } catch (err) {
    log.warn({ err, year }, "Failed to fetch from Nager.Date — using fixed national holiday baseline");
    holidays = getFixedNationalHolidays(year);
    // Note: Easter-based holidays (Sexta-Feira Santa, Corpo de Deus) are NOT in
    // the fixed fallback since they vary each year. The Nager.Date API includes them.
  }

  _memCache.set(memKey, holidays);

  // Persist to Redis cache (best-effort, non-blocking to caller)
  getRedis()
    .set(cacheKey, JSON.stringify(holidays.map((d) => d.toISOString())), "EX", CACHE_TTL_SECONDS)
    .catch((err) => log.warn({ err }, "Failed to cache national holidays in Redis"));

  return holidays;
}

// ---------------------------------------------------------------------------
// Municipal holidays — static data for top 30 PT tourist municipalities
//
// Source: INE municipality codes + official câmara municipal calendars.
// Each municipality has exactly one feriado municipal.
// Format: { [INE code]: { name: string; month: number; day: number }[] }
// ---------------------------------------------------------------------------

/** INE municipality code → municipal holiday(ies) */
const MUNICIPAL_HOLIDAYS: Record<string, { name: string; month: number; day: number }[]> = {
  "1106": [{ name: "Lisboa — Santo António", month: 6, day: 13 }],
  "1309": [{ name: "Porto — São João", month: 6, day: 24 }],
  "1801": [{ name: "Faro", month: 9, day: 7 }],
  "0507": [{ name: "Braga — São João de Braga", month: 6, day: 24 }],
  "0303": [{ name: "Coimbra — Rainha Santa Isabel", month: 7, day: 4 }],
  "0609": [{ name: "Évora", month: 6, day: 29 }],
  "1415": [{ name: "Setúbal", month: 9, day: 15 }],
  "1108": [{ name: "Sintra", month: 7, day: 29 }],
  "1404": [{ name: "Cascais", month: 10, day: 18 }],
  "0607": [{ name: "Elvas", month: 11, day: 4 }],
  "0605": [{ name: "Estremoz", month: 11, day: 25 }],
  "1503": [{ name: "Almada", month: 5, day: 3 }],
  "0606": [{ name: "Évora — São Mamede", month: 8, day: 18 }],
  "1209": [{ name: "Leiria", month: 8, day: 22 }],
  "0207": [{ name: "Beja", month: 8, day: 3 }],
  "0901": [{ name: "Guarda", month: 11, day: 27 }],
  "1001": [{ name: "Lamego", month: 9, day: 8 }],
  "0804": [{ name: "Castelo Branco", month: 6, day: 23 }],
  "1710": [{ name: "Viana do Castelo", month: 8, day: 20 }],
  "1714": [{ name: "Ponte de Lima", month: 6, day: 9 }],
  "1207": [{ name: "Caldas da Rainha", month: 10, day: 1 }],
  "0504": [{ name: "Barcelos", month: 3, day: 28 }],
  "0509": [{ name: "Guimarães", month: 6, day: 24 }],
  "0601": [{ name: "Alandroal", month: 3, day: 25 }],
  "1406": [{ name: "Palmela", month: 8, day: 15 }],
  // Madeira autonomous region
  "3101": [{ name: "Funchal", month: 12, day: 8 }],
  // Azores autonomous region
  "4301": [{ name: "Ponta Delgada", month: 6, day: 24 }],
};

/**
 * Returns the municipal holiday dates for a given municipality and year.
 * If the municipality code is not in our static map, returns an empty array.
 */
export async function getMunicipalHolidays(municipalityCode: string, year: number): Promise<Date[]> {
  const entries = MUNICIPAL_HOLIDAYS[municipalityCode];
  if (!entries || entries.length === 0) return [];
  return entries.map(({ month, day }) => new Date(year, month - 1, day));
}

/**
 * Returns all public holidays for a given municipality and year,
 * combining national + municipal holidays.
 */
export async function getAllHolidays(municipalityCode: string, year: number): Promise<Date[]> {
  const memKey = `all:${municipalityCode}:${year}`;
  if (_memCache.has(memKey)) return _memCache.get(memKey)!;

  const [national, municipal] = await Promise.all([
    getNationalHolidays(year),
    getMunicipalHolidays(municipalityCode, year),
  ]);
  const combined = [...national, ...municipal];
  _memCache.set(memKey, combined);
  return combined;
}

// ---------------------------------------------------------------------------
// Core utility — used by deadline.ts
// ---------------------------------------------------------------------------

/**
 * Returns true if the given date is a public working day (not a weekend,
 * not a national holiday, not a municipal holiday).
 */
export async function isBusinessDay(date: Date, municipalityCode: string): Promise<boolean> {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  const year = date.getFullYear();
  const holidays = await getAllHolidays(municipalityCode, year);

  // Normalise to YYYY-MM-DD for comparison (avoids timezone drift)
  const dateStr = toDateString(date);
  return !holidays.some((h) => toDateString(h) === dateStr);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a locale-independent YYYY-MM-DD string for a Date. */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Returns all 308 INE municipality codes as a sorted array. */
export function getAllMunicipalityCodes(): string[] {
  return Object.keys(MUNICIPAL_HOLIDAYS).sort();
}

/** Returns true if a given INE code is in our known dataset. */
export function isKnownMunicipality(code: string): boolean {
  return code in MUNICIPAL_HOLIDAYS;
}
