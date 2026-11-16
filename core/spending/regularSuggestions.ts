/**
 * "Is this a new regular bill?" — a charge that keeps coming, offered once for a yes / no.
 * Nothing is set aside until you say yes; a no is remembered.
 *
 * Deliberately strict, so a café you visit every month is never asked about:
 * - exactly ONE charge from that name per cycle (shops and cafés have several),
 * - the same amount (within 10%) on about the same day of the month (± 4 days),
 * - two cycles in a row for a standing order (הוראת קבע), three for an ordinary card charge,
 * - still coming: the last one is in this cycle or the one before,
 * - ₪25 or more, and not already a bill, an installment or a charge entered under Budget.
 */
import type { Transaction } from "../types.js";
import { effectiveSpend } from "../utils/transaction.js";
import { getBillingCycle } from "./pace.js";
import {
  allRegularCharges,
  customRuleKey,
  matchRegularCharge,
  PREVIEW_REGULAR_NOTE,
  type RegularChargeOverrides,
} from "./regularCharges.js";

const STANDING_ORDER = "הוראת קבע";
const INSTALLMENT_TYPES = new Set(["תשלומים", "רכישה בקרדיט"]);
/** Answered already: topped up / bought only when you feel like it. */
const NOT_REGULAR = /city\s*wash|ev\s*edge|leumi\s*bonus/i;

const MIN_AMOUNT = 25;
const AMOUNT_TOLERANCE = 1.1;
const DAY_TOLERANCE = 4;

export interface RegularSuggestion {
  /** Settings key ("custom:<name on the card>"). */
  key: string;
  merchant: string;
  name: string;
  /** Usual amount (middle of the charges seen). */
  amount: number;
  /** Day of the month it usually comes. */
  day: number;
  /** Cycles in a row it came. */
  cycles: number;
  lastDate: string;
}

function parse(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function suggestRegularCharges(
  transactions: Transaction[],
  opts: { cycleStart: string; cycleDay: number; overrides?: RegularChargeOverrides | null },
): RegularSuggestion[] {
  const rules = allRegularCharges(opts.overrides);
  const cur = parse(opts.cycleStart);
  const curIdx = cur.getFullYear() * 12 + cur.getMonth();
  const byMerchant = new Map<string, Map<number, Transaction[]>>();
  const seen = new Set<string>();
  for (const tx of transactions) {
    const merchant = (tx.merchant_he ?? "").trim();
    if (!merchant || !(effectiveSpend(tx) > 0)) continue;
    if (tx.notes?.startsWith("fixed_charge:") || tx.notes?.startsWith(PREVIEW_REGULAR_NOTE)) continue;
    if (INSTALLMENT_TYPES.has(tx.transaction_type_he ?? "")) continue;
    if (matchRegularCharge(tx, rules)) continue;
    const dup = `${tx.date.slice(0, 10)}|${merchant}|${tx.charge_amount}|${tx.notes ?? ""}`;
    if (seen.has(dup)) continue;
    seen.add(dup);
    const start = getBillingCycle(parse(tx.date), opts.cycleDay).start;
    const idx = start.getFullYear() * 12 + start.getMonth();
    if (idx > curIdx) continue;
    let cycles = byMerchant.get(merchant);
    if (!cycles) byMerchant.set(merchant, (cycles = new Map()));
    cycles.set(idx, [...(cycles.get(idx) ?? []), tx]);
  }

  const out: RegularSuggestion[] = [];
  for (const [merchant, cycles] of byMerchant) {
    const key = customRuleKey(merchant);
    if (opts.overrides?.[key]) continue;
    const last = Math.max(...cycles.keys());
    if (last < curIdx - 1) continue;
    const run: Transaction[] = [];
    for (let i = last; cycles.get(i)?.length === 1; i--) run.push(cycles.get(i)![0]);
    if (NOT_REGULAR.test(`${merchant} ${run[0]?.merchant_en ?? ""}`)) continue;
    const standing = run.length > 0 && run.every((t) => t.transaction_type_he === STANDING_ORDER);
    const need = standing ? 2 : 3;
    if (run.length < need) continue;
    const recent = run.slice(0, Math.max(need, Math.min(run.length, 3)));
    const amounts = recent.map((t) => effectiveSpend(t)).sort((a, b) => a - b);
    if (amounts[0] < MIN_AMOUNT || amounts[amounts.length - 1] > amounts[0] * AMOUNT_TOLERANCE) continue;
    const days = recent.map((t) => Number(t.date.slice(8, 10)));
    const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 30 - Math.abs(a - b));
    if (days.some((d) => apart(d, days[0]) > DAY_TOLERANCE)) continue;
    out.push({
      key,
      merchant,
      name: run[0].merchant_en || merchant,
      amount: Math.round(amounts[Math.floor((amounts.length - 1) / 2)]),
      day: days[0],
      cycles: run.length,
      lastDate: run[0].date.slice(0, 10),
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}
