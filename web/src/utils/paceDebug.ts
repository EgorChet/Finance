import type { PaceDebugInfo } from "./pace";

const PACE_DEBUG_STORAGE_KEY = "finance_pace_debug";

/** Enable in the browser console: localStorage.finance_pace_debug = '1' (also on in dev builds). */
export function isPaceDebugEnabled(): boolean {
  try {
    if (import.meta.env?.DEV) return true;
  } catch {
    /* not a Vite bundle */
  }
  try {
    return localStorage.getItem(PACE_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPaceDebugEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(PACE_DEBUG_STORAGE_KEY, "1");
    else localStorage.removeItem(PACE_DEBUG_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function logPaceDebug(debug: PaceDebugInfo, label = "Pace calculation"): void {
  if (!isPaceDebugEnabled()) return;

  console.groupCollapsed(`[Finance] ${label}`);
  console.log("Cycle", {
    start: debug.cycleStart,
    end: debug.cycleEnd,
    day: `${debug.dayIndex} / ${debug.cycleLength}`,
    cycleDay: debug.cycleDay,
    mode: debug.includeFixed ? "all spend" : "everyday",
  });
  console.log("Configured charges", {
    fromApi: debug.configuredChargeSource.fromApi,
    inferredFromCurrentCycle: debug.configuredChargeSource.fromInferred,
    mergedTotal: debug.configuredChargeSource.merged,
    charges: debug.configuredChargesUsed,
  });
  console.log("Current spend", debug.current);
  console.table(debug.historicalCycles);
  console.log("Usual at this point", {
    formula: debug.usualAtDayFormula,
    result: debug.usualAtDay,
  });
  console.log("Month-end projection", debug.projection);
  console.groupEnd();
}
