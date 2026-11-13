/**
 * Regular charges: bills and subscriptions that come every month or every two months.
 * Each one is set aside in the cycle it's expected in, until the real charge posts.
 *
 * - Next date = the month after the last posting (+1 or +2), on the day of the month it
 *   usually posts (median of recent postings). A bill that's late stays set aside in the
 *   next cycle (carried over); one that came early moves the next date with it.
 * - Arnona posts anywhere from the 2nd to the 16th — either side of the cycle start — so it's
 *   set aside already when it's expected up to a week after the cycle ends. Water (10th–12th),
 *   gas (15th–22nd) and electricity (mostly 8th–9th) keep to their days.
 * - Amount = middle of the last 3 (monthly), last bill (arnona), average of the last 3
 *   (water, gas), or for electricity the average of the last bill and the same bill a year
 *   earlier (summer AC / winter heating), when the history reaches that far.
 * - Hairdresser and nails have no fixed rhythm: set aside every cycle until they come.
 * - Only charges seen on the card at least once are set aside (a new subscription starts
 *   being held after its first charge).
 * - A bill more than 14 days past its expected date is released ("missed"); if it still
 *   comes, it's simply charged then.
 *
 * Egor can switch a line off or fix its amount under Budget (overrides).
 * Built from his Cal statements (Nov 2026): arnona / electricity / water every 2 months
 * around the cycle start, gas every 2 months mid-cycle, the rest monthly.
 */
import type { Transaction } from "../types.js";
import { effectiveSpend } from "../utils/transaction.js";
import { roundMoney } from "../utils/format.js";

export type RegularChargeEstimate = "last" | "median" | "average" | "seasonal";

export interface RegularChargeRule {
  id: string;
  name: string;
  /** Tested against "merchant_he merchant_en". */
  pattern: RegExp;
  /** Only charges of exactly this amount (BIT / PayBox / Apple). */
  exactAmount?: number;
  /** Ignore smaller charges (e.g. ChatGPT API top-ups, arnona parking fines). */
  minAmount?: number;
  everyMonths: 1 | 2;
  /** Also set aside when expected up to this many days after the cycle ends (bill wanders around the start). */
  earlyWindowDays?: number;
  /** No fixed rhythm (hairdresser, nails): set aside every cycle until it comes. */
  irregular?: boolean;
  /** Used until there's history, or when you set an amount by hand. */
  defaultAmount: number;
  estimate: RegularChargeEstimate;
}

export interface RegularChargeOverride {
  off?: boolean;
  /** Fixed amount instead of the estimate. */
  amount?: number | null;
}

export type RegularChargeOverrides = Record<string, RegularChargeOverride>;

export interface RegularChargeSettings {
  overrides: RegularChargeOverrides;
  updated_at?: string;
}

export const DEFAULT_REGULAR_CHARGES: readonly RegularChargeRule[] = [
  { id: "vaad", name: "Vaad bayit", pattern: /ועד\s*ה?בית|vaad\s*(ha)?bayit/i, everyMonths: 1, defaultAmount: 454, estimate: "median" },
  { id: "chatgpt", name: "ChatGPT", pattern: /openai|chatgpt/i, minAmount: 250, everyMonths: 1, defaultAmount: 370, estimate: "median" },
  { id: "cursor", name: "Cursor", pattern: /cursor/i, minAmount: 100, everyMonths: 1, defaultAmount: 185, estimate: "median" },
  { id: "bezeq", name: "Bezeq", pattern: /בזק|bezeq/i, everyMonths: 1, defaultAmount: 160, estimate: "median" },
  { id: "hot", name: "HOT mobile", pattern: /הוט\s*מובייל|hot\s*mobile/i, everyMonths: 1, defaultAmount: 120, estimate: "median" },
  { id: "anthropic", name: "Claude (Anthropic)", pattern: /anthropic/i, everyMonths: 1, defaultAmount: 60, estimate: "median" },
  { id: "apple", name: "Apple", pattern: /apple\.com/i, exactAmount: 39.9, everyMonths: 1, defaultAmount: 39.9, estimate: "last" },
  { id: "hairdresser", name: "Hairdresser (BIT ₪120)", pattern: /\bBIT\b/, exactAmount: 120, everyMonths: 1, irregular: true, defaultAmount: 120, estimate: "last" },
  { id: "nails", name: "Nails (PayBox ₪220)", pattern: /paybox|פייבוקס/i, exactAmount: 220, everyMonths: 1, irregular: true, defaultAmount: 220, estimate: "last" },
  { id: "arnona", name: "Arnona", pattern: /עיריית|ארנונה|arnona|municipality/i, minAmount: 300, everyMonths: 2, earlyWindowDays: 7, defaultAmount: 1550, estimate: "last" },
  { id: "electricity", name: "Electricity", pattern: /חברת\s*החשמל|israel\s*electric/i, everyMonths: 2, defaultAmount: 500, estimate: "seasonal" },
  { id: "water", name: "Water", pattern: /מי\s*נתניה|תאגיד\s*המים|water\s*corp/i, everyMonths: 2, defaultAmount: 300, estimate: "average" },
  { id: "gas", name: "Gas", pattern: /סופרגז|אמישראגז|פזגז|דורגז|supergas|amisragas/i, everyMonths: 2, defaultAmount: 330, estimate: "average" },
];

/** Rules in effect: defaults minus the ones switched off, with hand-set amounts applied. */
export function resolveRegularCharges(overrides?: RegularChargeOverrides | null): RegularChargeRule[] {
  return DEFAULT_REGULAR_CHARGES.filter((r) => !overrides?.[r.id]?.off).map((r) => {
    const amount = overrides?.[r.id]?.amount;
    return amount != null && amount > 0 ? { ...r, defaultAmount: amount, fixedAmount: true } as RegularChargeRule & { fixedAmount: true } : r;
  });
}

function hasFixedAmount(rule: RegularChargeRule): boolean {
  return (rule as { fixedAmount?: boolean }).fixedAmount === true;
}

export function matchRegularCharge(tx: Transaction, rules: readonly RegularChargeRule[]): RegularChargeRule | null {
  // Charges you entered under Budget are merged in as their own rows — never mistake them for a card charge.
  if (tx.notes?.startsWith("fixed_charge:")) return null;
  const amount = effectiveSpend(tx);
  if (!(amount > 0)) return null;
  const text = `${tx.merchant_he ?? ""} ${tx.merchant_en ?? ""}`;
  for (const rule of rules) {
    if (!rule.pattern.test(text)) continue;
    if (rule.exactAmount != null && Math.abs(tx.charge_amount - rule.exactAmount) > 0.5) continue;
    if (rule.minAmount != null && amount < rule.minAmount) continue;
    return rule;
  }
  return null;
}

export interface RegularChargeStatus {
  id: string;
  name: string;
  everyMonths: 1 | 2;
  /**
   * posted = came this cycle; due = expected this cycle (set aside); later = next cycle or after;
   * missed = more than 14 days late, released; unknown = never seen on the card yet.
   */
  state: "posted" | "due" | "later" | "missed" | "unknown";
  /** Real amount when posted, otherwise the estimate. */
  amount: number;
  /** YYYY-MM-DD: when it posted, or the expected date. */
  date: string | null;
  /** True when the expected date already passed (late bill, carried over). */
  late: boolean;
  /** How the amount was worked out, e.g. "average of the last 3". */
  basis: string;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parse(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addMonths(s: string, months: number): string {
  const d = parse(s);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return iso(target);
}

export const LATE_RELEASE_DAYS = 14;

function addDays(s: string, days: number): string {
  const d = parse(s);
  d.setDate(d.getDate() + days);
  return iso(d);
}

function daysApart(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
}

/** Month after the last posting (+everyMonths), on the usual day of the month. */
function nextDate(past: { date: string }[], everyMonths: number): string {
  const last = past[past.length - 1].date;
  const days = past.slice(-6).map((p) => Number(p.date.slice(8, 10))).sort((a, b) => a - b);
  const usualDay = days[Math.floor((days.length - 1) / 2)];
  const [y, m] = last.split("-").map(Number);
  const lastOfMonth = new Date(y, m - 1 + everyMonths + 1, 0).getDate();
  return iso(new Date(y, m - 1 + everyMonths, Math.min(usualDay, lastOfMonth)));
}

/** Charges of one bill a few days apart (HOT's two lines) count as one posting. */
function postings(txs: Transaction[]): { date: string; amount: number }[] {
  const out: { date: string; amount: number }[] = [];
  for (const tx of [...txs].sort((a, b) => a.date.localeCompare(b.date))) {
    const date = tx.date.slice(0, 10);
    const last = out[out.length - 1];
    if (last && daysApart(last.date, date) <= 5) last.amount += effectiveSpend(tx);
    else out.push({ date, amount: effectiveSpend(tx) });
  }
  return out.map((p) => ({ date: p.date, amount: roundMoney(p.amount) }));
}

function estimateAmount(rule: RegularChargeRule, past: { date: string; amount: number }[], expected: string | null) {
  if (hasFixedAmount(rule)) return { amount: rule.defaultAmount, basis: "your amount" };
  if (!past.length) return { amount: rule.defaultAmount, basis: "usual amount" };
  const last = past[past.length - 1];
  if (rule.estimate === "median") {
    const recent = past.slice(-3).map((p) => p.amount).sort((a, b) => a - b);
    return { amount: Math.round(recent[Math.floor(recent.length / 2)]), basis: recent.length > 2 ? "usual of the last 3" : "last charge" };
  }
  if (rule.estimate === "average") {
    const recent = past.slice(-3);
    return {
      amount: Math.round(recent.reduce((s, p) => s + p.amount, 0) / recent.length),
      basis: recent.length > 1 ? `average of the last ${recent.length}` : "last bill",
    };
  }
  if (rule.estimate === "seasonal" && expected) {
    const yearAgo = past.find((p) => Math.abs(daysApart(p.date, addMonths(expected, -12))) <= 25);
    if (yearAgo && yearAgo !== last) {
      return { amount: Math.round((yearAgo.amount + last.amount) / 2), basis: "last bill and the same bill last year" };
    }
  }
  return { amount: rule.exactAmount ?? Math.round(last.amount), basis: rule.everyMonths === 2 ? "last bill" : "last charge" };
}

/**
 * Where each regular charge stands in the cycle [cycleStart, cycleEnd].
 * `cycleTransactions` = the open cycle's list; `history` = earlier transactions (may overlap).
 */
export function regularChargesForCycle(
  rules: readonly RegularChargeRule[],
  cycleTransactions: Transaction[],
  history: Transaction[] | undefined,
  cycleStart: string,
  cycleEnd: string,
  /** Today (YYYY-MM-DD): bills more than LATE_RELEASE_DAYS past their date are released. */
  today?: string,
): RegularChargeStatus[] {
  const seen = new Set<string>();
  const all: Transaction[] = [];
  for (const tx of [...(history ?? []), ...cycleTransactions]) {
    const key = `${tx.date.slice(0, 10)}|${tx.merchant_he}|${tx.charge_amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(tx);
  }
  const inCycle = new Set(cycleTransactions);

  return rules.map((rule) => {
    const mine = all.filter((tx) => matchRegularCharge(tx, [rule]));
    const posted = mine.filter((tx) => inCycle.has(tx) || (tx.date.slice(0, 10) >= cycleStart && tx.date.slice(0, 10) <= cycleEnd));
    const base = { id: rule.id, name: rule.name, everyMonths: rule.everyMonths };
    if (posted.length) {
      const amount = roundMoney(posted.reduce((s, tx) => s + effectiveSpend(tx), 0));
      const date = posted.map((tx) => tx.date.slice(0, 10)).sort().pop() ?? null;
      return { ...base, state: "posted" as const, amount, date, late: false, basis: "charged" };
    }
    const past = postings(mine.filter((tx) => tx.date.slice(0, 10) < cycleStart));
    if (rule.irregular) {
      const est = estimateAmount(rule, past, null);
      return { ...base, state: "due" as const, amount: est.amount, date: null, late: false, basis: est.basis };
    }
    if (!past.length) {
      // Never on the card yet (e.g. a subscription not started) — nothing to hold until it shows up.
      const est = estimateAmount(rule, past, null);
      return { ...base, state: "unknown" as const, amount: est.amount, date: null, late: false, basis: est.basis };
    }
    const expected = nextDate(past, rule.everyMonths);
    const est = estimateAmount(rule, past, expected);
    // Not come for a whole extra period → stopped (cancelled subscription, nails on a break).
    if (expected < addMonths(cycleStart, -rule.everyMonths)) {
      return { ...base, state: "unknown" as const, amount: est.amount, date: expected, late: true, basis: est.basis };
    }
    // Too late to still be coming — release the money; if it does come, it's just charged.
    if (today && expected < today && daysApart(expected, today) > LATE_RELEASE_DAYS) {
      return { ...base, state: "missed" as const, amount: est.amount, date: expected, late: true, basis: est.basis };
    }
    const dueBy = rule.earlyWindowDays ? addDays(cycleEnd, rule.earlyWindowDays) : cycleEnd;
    const state = expected <= dueBy ? "due" : "later";
    return { ...base, state, amount: est.amount, date: expected, late: expected < cycleStart, basis: est.basis };
  });
}

/**
 * Regular charges you also entered by hand under Budget (e.g. "Vaad bayit" as a recurring charge).
 * The hand-entered one already counts, so these are skipped here — never set aside twice.
 */
export function rulesCoveredByConfigured(
  rules: readonly RegularChargeRule[],
  configured: readonly { name_en: string; name_he?: string }[],
): Set<string> {
  const covered = new Set<string>();
  for (const c of configured) {
    const text = `${c.name_he ?? ""} ${c.name_en ?? ""}`;
    for (const rule of rules) if (rule.pattern.test(text)) covered.add(rule.id);
  }
  return covered;
}
