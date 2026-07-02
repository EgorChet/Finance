/** Billing cycle helpers (mirrors web/src/utils/pace.ts, cycle day default 10). */

const DEFAULT_CYCLE_DAY = 10;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getBillingCycle(date: Date, cycleDay: number): { start: Date; end: Date } {
  let startYear = date.getFullYear();
  let startMonth = date.getMonth();
  if (date.getDate() < cycleDay) {
    startMonth -= 1;
    if (startMonth < 0) {
      startMonth = 11;
      startYear -= 1;
    }
  }
  const start = new Date(startYear, startMonth, cycleDay);
  const nextStart = new Date(startYear, startMonth + 1, cycleDay);
  const end = new Date(nextStart);
  end.setDate(end.getDate() - 1);
  return { start, end };
}

export function cycleStartForDate(date: Date, cycleDay = DEFAULT_CYCLE_DAY): string {
  return isoDate(getBillingCycle(date, cycleDay).start);
}

export function nextCycleStart(cycleStart: string, cycleDay = DEFAULT_CYCLE_DAY): string {
  const [y, m, d] = cycleStart.slice(0, 10).split("-").map(Number);
  const next = new Date(y, m, cycleDay);
  return isoDate(next);
}

/** Statement billing date for a cycle that starts on cycleStart. */
export function statementBillingDateForCycle(cycleStart: string, cycleDay = DEFAULT_CYCLE_DAY): string {
  return nextCycleStart(cycleStart, cycleDay);
}

export function openCycleBillingDate(now = new Date(), cycleDay = DEFAULT_CYCLE_DAY): string {
  const start = cycleStartForDate(now, cycleDay);
  return statementBillingDateForCycle(start, cycleDay);
}

export function openCycleStartDate(now = new Date(), cycleDay = DEFAULT_CYCLE_DAY): string {
  return cycleStartForDate(now, cycleDay);
}
