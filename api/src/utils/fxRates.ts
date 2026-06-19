/** Fetch currency→ILS from Frankfurter. Used only when the bank has not billed in ILS yet. */
import type { Transaction } from "../types.js";
import { readFxFallback, writeFxFallback } from "../storage/index.js";
import { detectCurrency, isPendingCharge } from "./fx.js";

const FRANKFURTER_V2 = "https://api.frankfurter.dev/v2/rate";
const FRANKFURTER_V1 = "https://api.frankfurter.dev/v1";

const FX_CURRENCIES = ["USD", "EUR", "PLN", "GBP", "BGN", "AMD"] as const;

const txCache = new Map<string, number>();
let dailyRates: Record<string, number> = {};
let dailyUpdated = "";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function cacheKey(currency: string, dateIso: string): string {
  return `${currency}|${dateIso.slice(0, 10)}`;
}

async function fetchRate(currency: string, dateIso: string): Promise<number | null> {
  const headers = { "User-Agent": "Finance/1.0 (fx-rates)" };

  try {
    const v2 = await fetch(`${FRANKFURTER_V2}/${currency}/ILS/${dateIso}`, { headers });
    if (v2.ok) {
      const data = (await v2.json()) as { rate?: number };
      if (data.rate != null) return data.rate;
    }
  } catch {
    /* try v1 */
  }

  try {
    const v1 = await fetch(`${FRANKFURTER_V1}/${dateIso}?from=${currency}&to=ILS`, { headers });
    if (v1.ok) {
      const data = (await v1.json()) as { rates?: { ILS?: number } };
      if (data.rates?.ILS != null) return data.rates.ILS;
    }
  } catch {
    /* fallback below */
  }

  return null;
}

async function fetchTodayRates(): Promise<Record<string, number>> {
  const today = todayIso();
  const rates: Record<string, number> = { ILS: 1 };
  await Promise.all(
    FX_CURRENCIES.map(async (currency) => {
      const rate = await fetchRate(currency, today);
      if (rate != null) rates[currency] = rate;
    }),
  );
  return Object.keys(rates).length > 1 ? rates : {};
}

/** Load today's rates from storage or Frankfurter; refresh once per calendar day. */
export async function ensureDailyFallback(): Promise<Record<string, number>> {
  const today = todayIso();
  if (dailyUpdated === today && Object.keys(dailyRates).length) {
    return dailyRates;
  }

  const stored = await readFxFallback();
  if (stored.updated === today && Object.keys(stored.rates).length) {
    dailyRates = stored.rates;
    dailyUpdated = today;
    return dailyRates;
  }

  const fresh = await fetchTodayRates();
  if (Object.keys(fresh).length) {
    await writeFxFallback({ updated: today, rates: fresh });
    dailyRates = fresh;
    dailyUpdated = today;
    return dailyRates;
  }

  if (Object.keys(stored.rates).length) {
    dailyRates = stored.rates;
    dailyUpdated = stored.updated;
    return dailyRates;
  }

  dailyRates = { ILS: 1 };
  dailyUpdated = today;
  return dailyRates;
}

function fallbackRate(currency: string): number {
  return dailyRates[currency] ?? dailyRates.USD ?? 1;
}

export function getRateToIls(currency: string, dateIso: string): number {
  if (currency === "ILS") return 1;
  const key = cacheKey(currency, dateIso);
  const cached = txCache.get(key);
  if (cached != null) return cached;
  return fallbackRate(currency);
}

export async function prefetchRatesForPending(transactions: Transaction[]): Promise<void> {
  await ensureDailyFallback();

  const pairs = new Map<string, { currency: string; date: string }>();

  for (const tx of transactions) {
    if (tx.charge_amount > 0) continue;
    if (tx.amount <= 0) continue;
    if (!isPendingCharge(tx.charge_amount, tx.notes)) continue;

    const currency = detectCurrency(tx.merchant_he, tx.amount, null);
    if (currency === "ILS") continue;

    const date = tx.date.slice(0, 10);
    pairs.set(cacheKey(currency, date), { currency, date });
  }

  await Promise.all(
    [...pairs.values()].map(async ({ currency, date }) => {
      const key = cacheKey(currency, date);
      if (txCache.has(key)) return;
      const rate = await fetchRate(currency, date);
      txCache.set(key, rate ?? fallbackRate(currency));
    }),
  );
}

export function clearRateCache(): void {
  txCache.clear();
}
