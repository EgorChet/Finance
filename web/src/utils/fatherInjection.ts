import { roundMoney, formatIls } from "./format";
import { chargesForMonth, isMonthlyCharge, type ConfiguredCharge } from "./fixedCharges";

export const FATHER_INJECTION_LABEL = "Father injection";
const ONGOING_THROUGH_MONTH = "2035-12";

const RENT_CHARGE_IDS = new Set(["flat-rent", "rent"]);
const RENT_NAME_RE = /\b(flat rent|rent\b|שכירות)/i;
const CAR_LOAN_NAME_RE = /\b(car loan|הלוואת רכב)/i;

export function isRentConfiguredCharge(charge: ConfiguredCharge): boolean {
  if (RENT_CHARGE_IDS.has(charge.id)) return true;
  const name = `${charge.name_en} ${charge.name_he || ""}`;
  return RENT_NAME_RE.test(name) && !CAR_LOAN_NAME_RE.test(name);
}

/** Active flat-rent extra charge for a calendar month — amount is added to the living budget cap. */
export function rentChargeForMonth(ym: string, charges: ConfiguredCharge[]): ConfiguredCharge | null {
  const active = chargesForMonth(ym, charges).filter(
    (c) => isRentConfiguredCharge(c) && isMonthlyCharge(c),
  );
  return active.find((c) => RENT_CHARGE_IDS.has(c.id)) ?? active[0] ?? null;
}

export function fatherInjectionForMonth(ym: string, charges: ConfiguredCharge[]): number {
  const charge = rentChargeForMonth(ym, charges);
  return charge ? roundMoney(charge.amount) : 0;
}

function nextCalendarMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Calendar months covered by a budget or charge segment (inclusive). */
export function calendarMonthsInSegment(fromMonth: string, throughMonth: string): string[] {
  const end = throughMonth === ONGOING_THROUGH_MONTH ? throughMonth : throughMonth;
  const months: string[] = [];
  let cursor = fromMonth;
  while (cursor <= end) {
    months.push(cursor);
    if (cursor === end) break;
    cursor = nextCalendarMonth(cursor);
    if (months.length > 600) break;
  }
  return months;
}

/** Distinct Father injection amounts across a living-budget segment. */
export function fatherInjectionAmountsForSegment(
  fromMonth: string,
  throughMonth: string,
  charges: ConfiguredCharge[],
): number[] {
  const amounts = new Set<number>();
  for (const ym of calendarMonthsInSegment(fromMonth, throughMonth)) {
    const amount = fatherInjectionForMonth(ym, charges);
    if (amount > 0) amounts.add(amount);
  }
  return [...amounts].sort((a, b) => a - b);
}

export function formatFatherInjectionBadge(amounts: number[]): string {
  if (!amounts.length) return "";
  if (amounts.length === 1) return formatIls(amounts[0]);
  return `${formatIls(amounts[0])}–${formatIls(amounts[amounts.length - 1])}`;
}
