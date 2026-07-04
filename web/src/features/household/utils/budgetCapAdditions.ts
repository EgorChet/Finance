import { roundMoney } from "@/shared/utils/format";
import { chargesForMonth, isMonthlyCharge, type ConfiguredCharge } from "@/features/household/utils/fixedCharges";
import { isConfiguredEverydayCharge } from "@/features/household/utils/householdBudget";
import {
  FATHER_INJECTION_LABEL,
  fatherInjectionForMonth,
  isRentConfiguredCharge,
} from "@/features/household/utils/fatherInjection";
import { chargeDisplayName } from "@/features/household/utils/fixedCharges";

export { FATHER_INJECTION_LABEL, fatherInjectionForMonth } from "@/features/household/utils/fatherInjection";

export const CIBUS_LABEL = "Cibus";

const CIBUS_CHARGE_IDS = new Set(["cibus-card", "cibus"]);
const CIBUS_NAME_RE = /\bcibus\b/i;

export type CapAdditionKind = "cibus" | "rent";

export interface CapAdditionPeriod {
  kind: CapAdditionKind;
  label: string;
  chargeId: string;
  amount: number;
  from_month: string;
  through_month: string;
}

export function isCibusConfiguredCharge(charge: ConfiguredCharge): boolean {
  if (CIBUS_CHARGE_IDS.has(charge.id)) return true;
  const name = `${charge.name_en} ${charge.name_he || ""}`;
  return CIBUS_NAME_RE.test(name) && isConfiguredEverydayCharge(charge);
}

export function cibusChargeForMonth(ym: string, charges: ConfiguredCharge[]): ConfiguredCharge | null {
  const active = chargesForMonth(ym, charges).filter(
    (c) => isCibusConfiguredCharge(c) && isMonthlyCharge(c),
  );
  return active.find((c) => CIBUS_CHARGE_IDS.has(c.id)) ?? active[0] ?? null;
}

/** Active Cibus allowance for a calendar month — from recurring charges, not hardcoded. */
export function cibusAllowanceForMonth(ym: string, charges: ConfiguredCharge[]): number {
  const charge = cibusChargeForMonth(ym, charges);
  return charge ? roundMoney(charge.amount) : 0;
}

function clipMonthRange(
  budgetFrom: string,
  budgetThrough: string,
  chargeFrom: string,
  chargeThrough: string,
): { from_month: string; through_month: string } | null {
  if (chargeFrom > budgetThrough || chargeThrough < budgetFrom) return null;
  return {
    from_month: chargeFrom < budgetFrom ? budgetFrom : chargeFrom,
    through_month: chargeThrough > budgetThrough ? budgetThrough : chargeThrough,
  };
}

/** Cibus and rent periods that overlap a living-budget segment — one row per charge period. */
export function capAdditionPeriodsForSegment(
  segment: { from_month: string; through_month: string },
  charges: ConfiguredCharge[],
): CapAdditionPeriod[] {
  const periods: CapAdditionPeriod[] = [];

  for (const charge of charges) {
    if (!isMonthlyCharge(charge)) continue;

    let kind: CapAdditionKind | null = null;
    let label = "";
    if (isCibusConfiguredCharge(charge)) {
      kind = "cibus";
      label = CIBUS_LABEL;
    } else if (isRentConfiguredCharge(charge)) {
      kind = "rent";
      label = chargeDisplayName(charge, FATHER_INJECTION_LABEL);
    } else {
      continue;
    }

    const overlap = clipMonthRange(
      segment.from_month,
      segment.through_month,
      charge.from_month,
      charge.through_month,
    );
    if (!overlap) continue;

    periods.push({
      kind,
      label,
      chargeId: charge.id,
      amount: roundMoney(charge.amount),
      from_month: overlap.from_month,
      through_month: overlap.through_month,
    });
  }

  const kindOrder: Record<CapAdditionKind, number> = { cibus: 0, rent: 1 };
  return periods.sort((a, b) => {
    const byKind = kindOrder[a.kind] - kindOrder[b.kind];
    if (byKind !== 0) return byKind;
    return a.from_month.localeCompare(b.from_month) || a.chargeId.localeCompare(b.chargeId);
  });
}

export function capAdditionsForMonth(ym: string, charges: ConfiguredCharge[]): number {
  return roundMoney(cibusAllowanceForMonth(ym, charges) + fatherInjectionForMonth(ym, charges));
}
