import { roundMoney } from "./format";

export interface ConfiguredCharge {
  id: string;
  name_en: string;
  name_he?: string;
  amount: number;
  category_en: string;
  from_month: string;
  through_month: string;
}

export function chargesForMonth(ym: string, charges: ConfiguredCharge[]): ConfiguredCharge[] {
  return charges.filter((c) => c.from_month <= ym && ym <= c.through_month);
}

/** Configured recurring charges for a billing cycle (deduped by id). */
export function configuredChargesForCycle(
  cycleStart: string,
  charges: ConfiguredCharge[],
): ConfiguredCharge[] {
  const ym = cycleStart.slice(0, 7);
  const byId = new Map<string, ConfiguredCharge>();
  for (const charge of chargesForMonth(ym, charges)) {
    byId.set(charge.id, charge);
  }
  return [...byId.values()];
}

export function sumConfiguredCharges(cycleStart: string, charges: ConfiguredCharge[]): number {
  return roundMoney(
    configuredChargesForCycle(cycleStart, charges).reduce((sum, c) => sum + c.amount, 0),
  );
}
