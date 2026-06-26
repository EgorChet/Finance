import { roundMoney } from "./format";
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

