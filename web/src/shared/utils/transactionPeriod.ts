import type { Transaction } from "@/shared/types";

export type TransactionPeriod = "today" | "yesterday" | "week" | "month";

export const TRANSACTION_PERIOD_OPTIONS: { value: TransactionPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

function parseIsoDate(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function inRange(dateIso: string, start: Date, end: Date): boolean {
  const d = normalizeDate(parseIsoDate(dateIso));
  return d >= start && d <= end;
}

function laterDate(a: Date, b: Date): Date {
  return a >= b ? a : b;
}

function earlierDate(a: Date, b: Date): Date {
  return a <= b ? a : b;
}

/** Monday-start week containing `reference` (matches calendar grid). */
export function startOfWeekMonday(reference: Date): Date {
  const ref = normalizeDate(reference);
  const start = new Date(ref);
  const daysFromMonday = (ref.getDay() + 6) % 7;
  start.setDate(ref.getDate() - daysFromMonday);
  return start;
}

/** Sunday end of the Monday-start week containing `reference`. */
export function endOfWeekSunday(reference: Date): Date {
  const start = startOfWeekMonday(reference);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
}

/** @deprecated use startOfWeekMonday */
export function startOfWeekSunday(reference: Date): Date {
  const ref = normalizeDate(reference);
  const start = new Date(ref);
  start.setDate(ref.getDate() - ref.getDay());
  return start;
}

export function filterTransactionsByPeriod(
  transactions: Transaction[],
  period: TransactionPeriod,
  reference: Date,
  /** When false (closed statement month), "This month" = all charges in that view. */
  liveView = true,
): Transaction[] {
  if (!liveView && period === "month") {
    return transactions;
  }

  const ref = normalizeDate(reference);
  const todayIso = isoDateLocal(ref);

  const yesterday = new Date(ref);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = isoDateLocal(yesterday);

  const monthStart = new Date(ref.getFullYear(), ref.getMonth(), 1);

  return transactions.filter((t) => {
    const dateIso = t.date.slice(0, 10);
    if (period === "today") return dateIso === todayIso;
    if (period === "yesterday") return dateIso === yesterdayIso;
    if (period === "week") {
      const weekStart = laterDate(startOfWeekMonday(ref), monthStart);
      const weekEnd = earlierDate(endOfWeekSunday(ref), ref);
      return inRange(dateIso, weekStart, weekEnd);
    }
    return inRange(dateIso, monthStart, ref);
  });
}
