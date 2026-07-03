import { currentYearMonth, segmentStatus } from "./fixedCharges";
import { previousCalendarMonth } from "./livingBudget";

export type TemporalBucket = "active" | "upcoming" | "ended";

export function temporalBucket(
  fromMonth: string,
  throughMonth: string,
  nowYm = currentYearMonth(),
): TemporalBucket {
  return segmentStatus(fromMonth, throughMonth, nowYm);
}

export function compareTemporalRanges(
  aFrom: string,
  aThrough: string,
  bFrom: string,
  bThrough: string,
  nowYm = currentYearMonth(),
): number {
  const aBucket = temporalBucket(aFrom, aThrough, nowYm);
  const bBucket = temporalBucket(bFrom, bThrough, nowYm);
  const order: Record<TemporalBucket, number> = { active: 0, upcoming: 1, ended: 2 };
  if (order[aBucket] !== order[bBucket]) return order[aBucket] - order[bBucket];
  if (aBucket === "ended") return bThrough.localeCompare(aThrough);
  return aFrom.localeCompare(bFrom);
}

export function isPastMonth(month: string, nowYm = currentYearMonth()): boolean {
  return month < nowYm;
}

/** Hide month extras older than the previous calendar month (keep current + last month visible). */
export function isArchivedTopupMonth(month: string, nowYm = currentYearMonth()): boolean {
  return month < previousCalendarMonth(nowYm);
}

export function compareMonthTopups(aMonth: string, bMonth: string, nowYm = currentYearMonth()): number {
  const aArchived = isArchivedTopupMonth(aMonth, nowYm);
  const bArchived = isArchivedTopupMonth(bMonth, nowYm);
  if (aArchived !== bArchived) return aArchived ? 1 : -1;
  return bMonth.localeCompare(aMonth);
}
