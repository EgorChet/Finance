/**
 * What the owner put in, for the "all time" change on the Money tab.
 * The amounts live in the database (app_state "investments"), never in the repository: it is public.
 * Only the owner's account gets the resulting percentage; the amounts themselves are never sent.
 */
import { readInvestments } from "../storage/index.js";
import type { InvestmentsData } from "../types.js";

/** A usable amount: a positive finite number, otherwise null. */
export function positiveAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Percent change from `base` to `value`, one decimal. */
export function percentChange(base: number, value: number): number {
  return Math.round((value / base - 1) * 1000) / 10;
}

/** All-time change of a holding against what was put in; undefined when the amount is not known. */
export function allTimePct(value: number, invested: number | null): number | undefined {
  return invested != null ? percentChange(invested, value) : undefined;
}

/** Adds all_time_pct to a quote for the owner. Anyone else, or no stored amount, gets the quote unchanged. */
export async function withAllTime<T extends object>(
  isOwner: boolean,
  quote: T,
  holdingUsd: number,
  key: keyof InvestmentsData,
): Promise<T & { all_time_pct?: number }> {
  if (!isOwner) return quote;
  try {
    const pct = allTimePct(holdingUsd, positiveAmount((await readInvestments())[key]));
    return pct === undefined ? quote : { ...quote, all_time_pct: pct };
  } catch {
    return quote; // the quote must never fail because of the amounts
  }
}
