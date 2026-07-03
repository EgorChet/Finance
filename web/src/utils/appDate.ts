/** Fixed “today” for demo mode — keeps live cycle + partial tab in sync with sample data. */
export const DEMO_AS_OF = "2026-06-13";

export function parseReferenceDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function referenceDate(isDemo: boolean, demoAsOf: string | null): Date {
  if (isDemo && demoAsOf) return parseReferenceDate(demoAsOf);
  if (isDemo) return parseReferenceDate(DEMO_AS_OF);
  return new Date();
}

export function yearMonthForDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function referenceYearMonth(isDemo: boolean, demoAsOf: string | null): string {
  return yearMonthForDate(referenceDate(isDemo, demoAsOf));
}
