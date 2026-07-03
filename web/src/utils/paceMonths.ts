/** Default billing keys loaded for pace baseline: current + 3 past months. */
export const DEFAULT_PACE_MONTHS = 4;

export const PACE_MONTHS_EXPAND_STEPS = [4, 8, 16, 0] as const;

export function nextPaceMonths(current: number): number {
  const idx = PACE_MONTHS_EXPAND_STEPS.indexOf(current as (typeof PACE_MONTHS_EXPAND_STEPS)[number]);
  if (idx < 0) return PACE_MONTHS_EXPAND_STEPS[1];
  if (idx >= PACE_MONTHS_EXPAND_STEPS.length - 1) return 0;
  return PACE_MONTHS_EXPAND_STEPS[idx + 1];
}

export function paceMonthsLabel(count: number): string {
  if (count <= 0) return "all history";
  return count === 1 ? "1 month" : `${count} months`;
}
