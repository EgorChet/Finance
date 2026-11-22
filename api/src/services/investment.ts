/**
 * What the owner put in, for the "all time" change on the Money tab.
 * The amounts are server settings (env), never part of the repository: it is public.
 */

/** Amount invested in USD from an env variable; null when it is missing or not a positive number. */
export function investedUsd(envName: string): number | null {
  const raw = process.env[envName]?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Percent change from `base` to `value`, one decimal. */
export function percentChange(base: number, value: number): number {
  return Math.round((value / base - 1) * 1000) / 10;
}

/** All-time change of a holding against what was put in; undefined when the amount is not set. */
export function allTimePct(value: number, invested: number | null): number | undefined {
  return invested != null ? percentChange(invested, value) : undefined;
}
