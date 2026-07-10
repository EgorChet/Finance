/** Billing cycle helpers (mirrors web/src/utils/pace.ts, cycle day default 10). */

const DEFAULT_CYCLE_DAY = 10;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

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
  const d = parseLocalDate(cycleStart);
  const next = new Date(d.getFullYear(), d.getMonth() + 1, cycleDay);
  return isoDate(next);
}

/** User-facing cycle name (e.g. billing 2026-07-10 → "Jun 2026"). */
export function billingCycleLabelFromIso(billingDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(billingDate)) return "Unknown cycle";
  const d = parseLocalDate(billingDate);
  d.setMonth(d.getMonth() - 1);
  const month = d.getMonth();
  if (month < 0 || month > 11) return "Unknown cycle";
  return `${MONTHS[month]} ${d.getFullYear()}`;
}

/** Infer statement billing date from tx dates when the xlsx header is missing (common on partial exports). */
export function inferBillingDateFromTransactions(
  transactions: { date: string }[],
  cycleDay = DEFAULT_CYCLE_DAY,
): string | undefined {
  if (!transactions.length) return undefined;
  const latest = transactions
    .map((t) => t.date.slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .at(-1);
  if (!latest) return undefined;
  const cycleStart = cycleStartForDate(parseLocalDate(latest), cycleDay);
  return statementBillingDateForCycle(cycleStart, cycleDay);
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
