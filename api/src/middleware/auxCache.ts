import { refreshExclusionsCache } from "../services/exclusions.js";
import { refreshFixedChargesCache } from "../services/fixedCharges.js";
import { refreshLivingBudgetCache } from "../services/livingBudget.js";
import { ensureDailyFallback } from "../utils/fxRates.js";

let lastRefreshAt = 0;
const REFRESH_MS = Number(process.env.AUX_CACHE_REFRESH_MS || 30_000);

/** Refresh exclusions / fixed charges / living budget / FX at most once per interval. */
export async function ensureAuxCachesFresh(): Promise<void> {
  const now = Date.now();
  if (lastRefreshAt > 0 && now - lastRefreshAt < REFRESH_MS) return;
  lastRefreshAt = now;
  await Promise.all([
    refreshExclusionsCache(),
    refreshFixedChargesCache(),
    refreshLivingBudgetCache(),
    ensureDailyFallback(),
  ]);
}

export function invalidateAuxCacheSchedule(): void {
  lastRefreshAt = 0;
}
