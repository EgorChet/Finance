import type { Transaction } from "../types";
import { costTypeForCategory } from "../categories";
import { roundMoney } from "./format";
import { isoDateLocal } from "./transactionPeriod";

export type ChargeSchedule = "monthly" | "once";

export interface ConfiguredCharge {
  id: string;
  name_en: string;
  name_he?: string;
  amount: number;
  category_en: string;
  from_month: string;
  through_month: string;
  schedule?: ChargeSchedule;
  charge_date?: string;
}

export function isOneTimeCharge(charge: ConfiguredCharge): boolean {
  return charge.schedule === "once";
}

export function isMonthlyCharge(charge: ConfiguredCharge): boolean {
  return !isOneTimeCharge(charge);
}

export function todayIsoDate(): string {
  return isoDateLocal(new Date());
}

export function normalizeConfiguredCharge(charge: ConfiguredCharge): ConfiguredCharge {
  const schedule: ChargeSchedule = charge.schedule === "once" ? "once" : "monthly";
  const amount = Math.round(charge.amount * 100) / 100;
  if (schedule === "once" && charge.charge_date) {
    const ym = charge.charge_date.slice(0, 7);
    return {
      ...charge,
      schedule,
      amount,
      charge_date: charge.charge_date.slice(0, 10),
      from_month: ym,
      through_month: ym,
    };
  }
  return { ...charge, schedule, amount };
}

export function chargesForMonth(ym: string, charges: ConfiguredCharge[]): ConfiguredCharge[] {
  return charges.filter((c) => c.from_month <= ym && ym <= c.through_month);
}

/** Configured charges for a billing cycle (deduped by id for monthly). */
export function configuredChargesForCycle(
  cycleStart: string,
  charges: ConfiguredCharge[],
  cycleEnd?: string,
): ConfiguredCharge[] {
  const ym = cycleStart.slice(0, 7);
  const end = cycleEnd ?? cycleStart;
  const byId = new Map<string, ConfiguredCharge>();
  for (const charge of charges) {
    if (isOneTimeCharge(charge)) {
      const date = charge.charge_date;
      if (!date || date < cycleStart || date > end) continue;
      byId.set(charge.id, charge);
      continue;
    }
    if (charge.from_month <= ym && ym <= charge.through_month) {
      byId.set(charge.id, charge);
    }
  }
  return [...byId.values()];
}

export function sumConfiguredCharges(
  cycleStart: string,
  charges: ConfiguredCharge[],
  cycleEnd?: string,
): number {
  return roundMoney(
    configuredChargesForCycle(cycleStart, charges, cycleEnd).reduce((sum, c) => sum + c.amount, 0),
  );
}

/** Rent, loans, education… — excludes groceries-style charges like Cibus (counted as everyday). */
export function sumConfiguredMonthlyBills(
  cycleStart: string,
  charges: ConfiguredCharge[],
  cycleEnd?: string,
): number {
  return roundMoney(
    configuredChargesForCycle(cycleStart, charges, cycleEnd)
      .filter((c) => costTypeForCategory(c.category_en) === "fixed")
      .reduce((sum, c) => sum + c.amount, 0),
  );
}

/** Groceries-style configured charges — excludes rent, loans, Dev Institute categories. */
export function sumConfiguredEverydayCharges(
  cycleStart: string,
  charges: ConfiguredCharge[],
  cycleEnd?: string,
): number {
  return roundMoney(
    sumConfiguredCharges(cycleStart, charges, cycleEnd) - sumConfiguredMonthlyBills(cycleStart, charges, cycleEnd),
  );
}

function dayIndexInCycle(cycleStart: string, chargeDate: string): number {
  const [sy, sm, sd] = cycleStart.slice(0, 10).split("-").map(Number);
  const [cy, cm, cd] = chargeDate.slice(0, 10).split("-").map(Number);
  const start = new Date(sy, sm - 1, sd);
  const charge = new Date(cy, cm - 1, cd);
  return Math.floor((charge.getTime() - start.getTime()) / 86400000) + 1;
}

/** Configured everyday charges through dayIndex (Cibus etc.) — from settings, not bank txs. */
export function configuredEverydayFromConfigAtDay(
  cycleStart: string,
  cycleEnd: string,
  dayIndex: number,
  charges: ConfiguredCharge[],
  cycleDay = DEFAULT_BILLING_CYCLE_DAY,
): number {
  if (dayIndex <= 0 || !charges.length) return 0;

  let sum = 0;
  for (const charge of configuredChargesForCycle(cycleStart, charges, cycleEnd)) {
    if (costTypeForCategory(charge.category_en) === "fixed") continue;
    const chargeDay = dayIndexInCycle(cycleStart, transactionDateForCharge(charge, cycleStart, cycleDay));
    if (chargeDay <= dayIndex) sum += charge.amount;
  }
  return roundMoney(sum);
}

/** @deprecated Use configuredEverydayFromConfigAtDay — kept for callers that subtract existing txs. */
export function configuredEverydayAtDay(
  cycleStart: string,
  cycleEnd: string,
  dayIndex: number,
  bucketTxs: Transaction[],
  charges: ConfiguredCharge[],
  cycleDay = DEFAULT_BILLING_CYCLE_DAY,
): number {
  void bucketTxs;
  return configuredEverydayFromConfigAtDay(cycleStart, cycleEnd, dayIndex, charges, cycleDay);
}

export const ONGOING_THROUGH_MONTH = "2035-12";

export function isOngoingThrough(throughMonth: string): boolean {
  return throughMonth >= "2030-01";
}

export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function segmentStatus(
  fromMonth: string,
  throughMonth: string,
  nowYm = currentYearMonth(),
): "upcoming" | "active" | "ended" {
  if (throughMonth < nowYm) return "ended";
  if (fromMonth > nowYm) return "upcoming";
  return "active";
}

export function oneTimeStatus(chargeDate: string, today = todayIsoDate()): "upcoming" | "active" | "past" {
  if (chargeDate > today) return "upcoming";
  if (chargeDate === today) return "active";
  return "past";
}

export interface ChargeGroup {
  id: string;
  name_en: string;
  name_he?: string;
  category_en: string;
  segments: ConfiguredCharge[];
}

export function groupCharges(charges: ConfiguredCharge[]): ChargeGroup[] {
  const groups = new Map<string, ChargeGroup>();
  for (const charge of charges.filter(isMonthlyCharge)) {
    const existing = groups.get(charge.id);
    if (existing) {
      existing.segments.push(charge);
      continue;
    }
    groups.set(charge.id, {
      id: charge.id,
      name_en: charge.name_en,
      name_he: charge.name_he,
      category_en: charge.category_en,
      segments: [charge],
    });
  }
  for (const group of groups.values()) {
    group.segments.sort((a, b) => a.from_month.localeCompare(b.from_month));
  }
  return [...groups.values()].sort((a, b) => a.name_en.localeCompare(b.name_en));
}

export function segmentKey(charge: ConfiguredCharge): string {
  if (isOneTimeCharge(charge)) {
    return `${charge.id}|${charge.charge_date}|${charge.amount}`;
  }
  return `${charge.id}|${charge.from_month}|${charge.through_month}|${charge.amount}`;
}

export function slugifyId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "charge";
}

export function ymToLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const idx = Number.parseInt(m, 10) - 1;
  if (idx < 0 || idx > 11 || !y) return ym;
  return `${months[idx]} ${y}`;
}

export function dateToLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const idx = Number.parseInt(m, 10) - 1;
  if (idx < 0 || idx > 11) return iso;
  return `${Number.parseInt(d, 10)} ${months[idx]} ${y}`;
}

export function monthRangeLabel(fromMonth: string, throughMonth: string): string {
  const from = ymToLabel(fromMonth);
  if (isOngoingThrough(throughMonth)) return `${from} → ongoing`;
  return `${from} → ${ymToLabel(throughMonth)}`;
}

/** Default billing cycle day — recurring charges without an explicit date land here. */
export const DEFAULT_BILLING_CYCLE_DAY = 10;

export function fixedChargeDateForBilling(billingDate: string, cycleDay = DEFAULT_BILLING_CYCLE_DAY): string {
  const [y, m] = billingDate.slice(0, 7).split("-").map(Number);
  const day = Math.min(Math.max(cycleDay, 1), 28);
  const lastDay = new Date(y, m, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return `${y}-${String(m).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

export function transactionDateForCharge(
  charge: ConfiguredCharge,
  billingDate: string,
  cycleDay = DEFAULT_BILLING_CYCLE_DAY,
): string {
  if (isOneTimeCharge(charge) && charge.charge_date) return charge.charge_date.slice(0, 10);
  return fixedChargeDateForBilling(billingDate, cycleDay);
}

/** Inject configured charges missing from an open-cycle transaction list. */
export function mergeConfiguredChargeTransactions(
  transactions: Transaction[],
  cycleStart: string,
  cycleEnd: string,
  charges: ConfiguredCharge[],
  billingLabel: string,
  cycleDay = DEFAULT_BILLING_CYCLE_DAY,
): Transaction[] {
  const applicable = configuredChargesForCycle(cycleStart, charges, cycleEnd);
  const chargeById = new Map(applicable.map((c) => [c.id, c]));
  const updated = transactions.flatMap((tx) => {
    if (!tx.notes?.startsWith("fixed_charge:")) return [tx];
    const id = tx.notes.slice("fixed_charge:".length);
    const charge = chargeById.get(id);
    if (!charge) return [];
    return [{
      ...tx,
      date: transactionDateForCharge(charge, cycleStart, cycleDay),
      merchant_he: charge.name_he || charge.name_en,
      merchant_en: charge.name_en,
      amount: charge.amount,
      charge_amount: charge.amount,
      category_en: charge.category_en,
      billing_month: billingLabel,
    }];
  });

  const existingIds = new Set(
    updated
      .filter((tx) => tx.notes?.startsWith("fixed_charge:"))
      .map((tx) => tx.notes!.slice("fixed_charge:".length)),
  );

  const added: Transaction[] = [];
  for (const charge of applicable) {
    if (existingIds.has(charge.id)) continue;
    added.push({
      date: transactionDateForCharge(charge, cycleStart, cycleDay),
      merchant_he: charge.name_he || charge.name_en,
      merchant_en: charge.name_en,
      amount: charge.amount,
      charge_amount: charge.amount,
      transaction_type_he: isOneTimeCharge(charge) ? "חיוב ידני" : "חיוב קבוע",
      category_he: null,
      category_en: charge.category_en,
      notes: `fixed_charge:${charge.id}`,
      merchant_known: true,
      billing_month: billingLabel,
    });
  }

  if (!added.length && updated.length === transactions.length
    && updated.every((tx, i) => tx === transactions[i])) {
    return transactions;
  }
  return [...updated, ...added].sort((a, b) => b.date.localeCompare(a.date));
}
