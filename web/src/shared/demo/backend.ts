/**
 * The demo's "server", running in the browser. Reads come from the generated household
 * (seed.ts) with your edits applied; writes only change this browser's copy (localStorage).
 * "Reset demo" throws the edits away.
 */
import { combineScopedReports } from "@core/spending/combineScoped";
import { mergeConfiguredChargeTransactions } from "@core/household/fixedCharges";
import { billingCycleLabel, roundMoney } from "@core/utils/format";
import { effectiveSpend } from "@core/utils/transaction";
import { defaultPaceSettings, type PaceSettings } from "@core/spending/paceSettings";
import type { RegularChargeOverrides } from "@core/spending/regularCharges";
import type { ConfiguredCharge } from "@/features/household/utils/fixedCharges";
import type { LivingBudgetMonthTopup, LivingBudgetSegment } from "@/features/household/utils/livingBudget";
import type { MerchantRules, MonthItem, SpendingReport, Transaction } from "@/shared/types";
import { knownMerchantName } from "@/shared/utils/merchantNames";
import { transactionKey } from "@/shared/utils/transactionKey";
import {
  DEMO_AI_GUESSES,
  DEMO_CYCLE_DAY,
  DEMO_RULES,
  buildDemoStatements,
  demoFixedCharges,
  demoLivingBudget,
  demoStarterEdits,
  iso,
  type DemoStatement,
} from "./seed";

const STORAGE_KEY = "finance_demo_state_v1";

interface DemoState {
  fixed_charges: ConfiguredCharge[];
  living_budget: { segments: LivingBudgetSegment[]; month_topups: LivingBudgetMonthTopup[] };
  regular_charges: RegularChargeOverrides;
  rules: MerchantRules;
  exclusions: Record<string, { note?: string; added_at: string; tx: Transaction }>;
  adjustments: Record<string, { reimbursement: number; note?: string; added_at: string; tx: Transaction }>;
  categories: Record<string, string>;
  reviewed: string[];
  deleted_months: string[];
  settings: PaceSettings;
}

function today(): string {
  return iso(new Date());
}

let statementsCache: { day: string; list: DemoStatement[] } | null = null;
function statements(): DemoStatement[] {
  const day = today();
  if (statementsCache?.day !== day) statementsCache = { day, list: buildDemoStatements(day) };
  return statementsCache.list;
}

function initialState(): DemoState {
  const day = today();
  const list = statements();
  const starter = demoStarterEdits(list);
  const now = new Date().toISOString();
  const state: DemoState = {
    fixed_charges: demoFixedCharges(day),
    living_budget: demoLivingBudget(day),
    regular_charges: {},
    rules: { ...DEMO_RULES },
    exclusions: {},
    adjustments: {},
    categories: {},
    reviewed: [],
    deleted_months: [],
    settings: { ...defaultPaceSettings(), cycle_day: DEMO_CYCLE_DAY },
  };
  if (starter.transfer) {
    state.exclusions[transactionKey(starter.transfer)] = { note: "Moved to savings — not spending", added_at: now, tx: starter.transfer };
  }
  if (starter.wolt) {
    const back = roundMoney(starter.wolt.charge_amount / 2);
    state.adjustments[transactionKey(starter.wolt)] = { reimbursement: back, note: "Friends paid back", added_at: now, tx: starter.wolt };
  }
  if (starter.bit) state.categories[transactionKey(starter.bit)] = "Eating out";
  return state;
}

let memo: DemoState | null = null;
function load(): DemoState {
  if (memo) return memo;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      memo = { ...initialState(), ...(JSON.parse(raw) as Partial<DemoState>) };
      return memo;
    }
  } catch {
    /* fall through to a fresh household */
  }
  memo = initialState();
  return memo;
}

function save(): void {
  try {
    if (memo) localStorage.setItem(STORAGE_KEY, JSON.stringify(memo));
  } catch {
    /* private mode: edits last until the tab closes */
  }
}

/** Forget every demo edit (the household starts over). */
export function resetDemo(): void {
  memo = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function demoHasEdits(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) != null;
  } catch {
    return false;
  }
}

// ── transactions with names, categories, splits and exclusions applied ──
function finalize(txs: Transaction[], s: DemoState): Transaction[] {
  const out: Transaction[] = [];
  for (const raw of txs) {
    const key = transactionKey(raw);
    if (s.exclusions[key]) continue;
    const rule = s.rules[raw.merchant_he];
    const t: Transaction = { ...raw };
    if (rule) {
      t.merchant_en = rule.english;
      t.merchant_known = true;
      if (rule.category) t.category_en = rule.category;
    }
    const cat = s.categories[key];
    if (cat) {
      t.category_original = t.category_en;
      t.category_override = cat;
      t.category_en = cat;
    }
    const adj = s.adjustments[key];
    if (adj && adj.reimbursement > 0) {
      t.reimbursement = adj.reimbursement;
      t.effective_amount = roundMoney(t.charge_amount - adj.reimbursement);
      if (adj.note) t.reimbursement_note = adj.note;
    }
    out.push(t);
  }
  return out;
}

function buildReport(txs: Transaction[], metadata: Record<string, unknown>): SpendingReport {
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
  let total = 0;
  const byCat = new Map<string, { total: number; count: number }>();
  for (const t of sorted) {
    const amt = effectiveSpend(t);
    total += amt;
    const c = byCat.get(t.category_en) ?? { total: 0, count: 0 };
    c.total += amt;
    c.count += 1;
    byCat.set(t.category_en, c);
  }
  const dates = sorted.map((t) => t.date).sort();
  return {
    metadata: { ...metadata, demo: true },
    total_spent: roundMoney(total),
    transaction_count: sorted.length,
    date_range: [dates[0] ?? "", dates[dates.length - 1] ?? ""],
    by_category: [...byCat.entries()]
      .map(([category_en, v]) => ({
        category_en,
        category_he: null,
        total: roundMoney(v.total),
        count: v.count,
        share_pct: total ? (v.total / total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total),
    top_merchants: [],
    unknown_merchants: [],
    transactions: sorted,
  };
}

function visibleStatements(s: DemoState): DemoStatement[] {
  return statements().filter((st) => !s.deleted_months.includes(st.billing));
}

function statementReport(st: DemoStatement, s: DemoState): SpendingReport {
  const label = billingCycleLabel(st.billing);
  const end = iso(new Date(new Date(`${st.billing}T12:00:00`).getTime() - 86400000));
  const day = today();
  // Charges entered by hand that are still ahead aren't on the card yet (the budget sets them aside).
  const withCharges = mergeConfiguredChargeTransactions(st.transactions, st.cycleStart, end, s.fixed_charges, label, DEMO_CYCLE_DAY)
    .filter((t) => !(st.partial && t.notes?.startsWith("fixed_charge:") && t.date.slice(0, 10) > day));
  const txs = finalize(withCharges, s).map((t) => ({ ...t, billing_month: t.billing_month || label }));
  return buildReport(txs, {
    billing_date: st.billing,
    source_file: `demo-${st.billing.slice(0, 7)}.xlsx`,
    provisional: st.partial,
    ...(st.partial ? { saved_at: `${today()}T07:30:00.000Z` } : {}),
  });
}

function monthItems(s: DemoState): MonthItem[] {
  return visibleStatements(s)
    .map((st) => ({
      key: st.billing,
      label: st.partial ? `${billingCycleLabel(st.billing)} · partial` : billingCycleLabel(st.billing),
      billing_date: st.billing,
      partial: st.partial,
      ...(st.partial ? { saved_at: `${today()}T07:30:00.000Z` } : {}),
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

function summaryRows(s: DemoState) {
  return visibleStatements(s).map((st) => {
    const r = statementReport(st, s);
    return { month: billingCycleLabel(st.billing), billing_date: st.billing, total: r.total_spent, transactions: r.transaction_count };
  });
}

function combined(list: DemoStatement[], s: DemoState): SpendingReport {
  const reports = list.map((st) => statementReport(st, s));
  const report = combineScopedReports(reports) ?? buildReport([], {});
  const billings = list.map((st) => st.billing).sort();
  return {
    ...report,
    metadata: {
      ...report.metadata,
      billing_date: undefined,
      combined_billing_dates: billings,
      statement_count: billings.length,
      demo: true,
    },
  };
}

// ── review ──
function reviewQueue(s: DemoState, q: URLSearchParams) {
  const includeReviewed = q.get("include_reviewed") === "true";
  const includeLabeled = q.get("include_labeled") === "true";
  const onePer = q.get("one_per_merchant") !== "false";
  const all = visibleStatements(s).flatMap((st) => finalize(st.transactions, s));
  const counts = new Map<string, number>();
  for (const t of all) counts.set(t.merchant_he, (counts.get(t.merchant_he) ?? 0) + 1);
  const seen = new Set<string>();
  const queue = [];
  for (const t of [...all].sort((a, b) => b.date.localeCompare(a.date))) {
    const labeled = !!s.rules[t.merchant_he];
    const reviewed = s.reviewed.includes(t.merchant_he);
    if (labeled && !includeLabeled) continue;
    if (reviewed && !includeReviewed) continue;
    if (onePer && seen.has(t.merchant_he)) continue;
    seen.add(t.merchant_he);
    queue.push({
      key: transactionKey(t),
      transaction: t,
      display_english: s.rules[t.merchant_he]?.english ?? "",
      occurrence_count: counts.get(t.merchant_he) ?? 1,
    });
  }
  return { queue, total: queue.length, reviewed_count: s.reviewed.length };
}

function labelHints(s: DemoState, body: { transaction?: Partial<Transaction> }) {
  const he = body.transaction?.merchant_he ?? "";
  const date = body.transaction?.date?.slice(0, 10) ?? "";
  const all = visibleStatements(s).flatMap((st) => finalize(st.transactions, s));
  const ai = DEMO_AI_GUESSES[he] ?? null;
  return {
    translation: knownMerchantName(he) ?? ai?.english_name ?? "",
    bank_category: null,
    bank_category_he: null,
    same_day: all
      .filter((t) => t.date.slice(0, 10) === date && t.merchant_he !== he)
      .slice(0, 5)
      .map((t) => ({ merchant: t.merchant_en || t.merchant_he, category: t.category_en, amount: t.charge_amount })),
    history: all
      .filter((t) => t.merchant_he === he)
      .slice(0, 12)
      .map((t) => ({ date: t.date, amount: t.charge_amount })),
    ai,
    ai_status: ai ? "ok" : "waiting",
  };
}

function findTx(s: DemoState, key: string, given?: Transaction): Transaction | undefined {
  if (given) return given;
  return statements().flatMap((st) => st.transactions).find((t) => transactionKey(t) === key);
}

// ── router ──
type Handler = (s: DemoState, q: URLSearchParams, body: any) => unknown;

const GET: Record<string, Handler> = {
  "/months": (s) => ({ months: monthItems(s), summary: summaryRows(s), demo: true, demo_as_of: today() }),
  "/home-data": (s, q) => {
    const n = Math.max(1, Number(q.get("pace_months") ?? 7));
    const list = visibleStatements(s).sort((a, b) => b.billing.localeCompare(a.billing)).slice(0, n);
    const scoped = Object.fromEntries(list.map((st) => [st.billing, statementReport(st, s)]));
    return {
      months: monthItems(s),
      summary: summaryRows(s),
      report: null,
      scoped_reports: scoped,
      pace_keys: list.map((st) => st.billing),
      pace_months: list.length,
      pace_months_requested: n,
      fixed_charges: s.fixed_charges,
      regular_charges: s.regular_charges,
      living_budget: s.living_budget,
      demo_as_of: today(),
    };
  },
  "/report": (s, q) => {
    const list = visibleStatements(s);
    const month = q.get("month");
    if (month) {
      const st = list.find((x) => x.billing === month);
      return st ? statementReport(st, s) : buildReport([], { billing_date: month });
    }
    const from = q.get("from");
    const to = q.get("to");
    if (from && to) return combined(list.filter((st) => st.billing >= from && st.billing <= to), s);
    const months = Number(q.get("months") ?? 0);
    if (months > 0) return combined([...list].sort((a, b) => b.billing.localeCompare(a.billing)).slice(0, months), s);
    return combined(list, s);
  },
  "/fixed-charges": (s) => ({ charges: s.fixed_charges }),
  "/living-budget": (s) => s.living_budget,
  "/regular-charges": (s) => ({ overrides: s.regular_charges }),
  "/rules": (s) => s.rules,
  "/settings": (s) => s.settings,
  "/config": () => ({ analyzer_wake_url: null, analyzer_wake_from_browser: false }),
  "/kaspa": () => ({ enabled: true, price_usdt: 0.0812, balance_kas: 12500, portfolio_usdt: 1015, updated_at: new Date().toISOString(), source: "demo" }),
  "/fxcn": () => ({ enabled: true, nav_usd: 1.0412, lots: 2400, portfolio_usd: 2498.88, updated_at: new Date().toISOString(), source: "demo" }),
  "/market-snapshot": () => ({ btc_usd: 98500, sp500: 6120, usd_ils: 3.68, usd_rub: 92.4, updated_at: new Date().toISOString() }),
  "/review/queue": (s, q) => reviewQueue(s, q),
  "/review/suggest": (_s, q) => ({ english: knownMerchantName(q.get("hebrew") ?? "") ?? "" }),
  "/exclusions": (s) => {
    const entries = Object.entries(s.exclusions).map(([key, e]) => ({
      key,
      note: e.note,
      added_at: e.added_at,
      source: "user" as const,
      date: e.tx.date,
      merchant_he: e.tx.merchant_he,
      merchant_en: s.rules[e.tx.merchant_he]?.english ?? e.tx.merchant_en,
      amount: e.tx.charge_amount,
      can_restore: true,
    }));
    return { entries, total: entries.length };
  },
  "/adjustments": (s) => {
    const entries = Object.entries(s.adjustments).map(([key, a]) => ({
      key,
      reimbursement: a.reimbursement,
      note: a.note,
      added_at: a.added_at,
      date: a.tx.date,
      merchant_he: a.tx.merchant_he,
      merchant_en: s.rules[a.tx.merchant_he]?.english ?? a.tx.merchant_en,
      amount: a.tx.charge_amount,
      effective_amount: roundMoney(a.tx.charge_amount - a.reimbursement),
      can_remove: true,
    }));
    return { entries, total: entries.length };
  },
};

const WRITE: Record<string, Handler> = {
  "/regular-charges": (s, _q, body) => {
    s.regular_charges = body?.overrides ?? {};
    return { saved: true, overrides: s.regular_charges };
  },
  "/fixed-charges": (s, _q, body) => {
    s.fixed_charges = body?.charges ?? [];
    return { saved: true, charges: s.fixed_charges };
  },
  "/living-budget": (s, _q, body) => {
    s.living_budget = { segments: body?.segments ?? [], month_topups: body?.month_topups ?? [] };
    return { saved: true, ...s.living_budget };
  },
  "/rules": (s, _q, body) => {
    s.rules = body ?? {};
    return { saved: true };
  },
  "/rules/entry": (s, _q, body) => {
    s.rules[body.hebrew] = { english: body.english, category: body.category ?? s.rules[body.hebrew]?.category ?? null };
    return { ok: true };
  },
  "/settings": (s, _q, body) => {
    s.settings = { ...s.settings, ...(body ?? {}) };
    return s.settings;
  },
  "/review/confirm": (s, _q, body) => {
    s.rules[body.hebrew] = { english: body.english, category: body.category ?? null };
    if (!s.reviewed.includes(body.hebrew)) s.reviewed.push(body.hebrew);
    return { ok: true, reviewed_count: s.reviewed.length };
  },
  "/review/progress/reset": (s) => {
    s.reviewed = [];
    return { ok: true };
  },
  "/review/hints": (s, _q, body) => labelHints(s, body),
  "/exclusions": (s, _q, body) => {
    const t = findTx(s, body?.key, body?.transaction);
    if (!t) throw new Error("Charge not found");
    const key = transactionKey(t);
    s.exclusions[key] = { note: body?.note, added_at: new Date().toISOString(), tx: t };
    return { ok: true, entry: { key, note: body?.note, can_restore: true } };
  },
  "/exclusions/remove": (s, _q, body) => {
    delete s.exclusions[body.key];
    return { ok: true };
  },
  "/adjustments": (s, _q, body) => {
    const t = findTx(s, body?.key, body?.transaction);
    if (!t) throw new Error("Charge not found");
    const key = transactionKey(t);
    s.adjustments[key] = { reimbursement: Number(body.reimbursement) || 0, note: body?.note, added_at: new Date().toISOString(), tx: t };
    return { ok: true, entry: { key, reimbursement: body.reimbursement, can_remove: true } };
  },
  "/adjustments/category": (s, _q, body) => {
    const key = transactionKey(body.transaction);
    if (body.category) s.categories[key] = body.category;
    else delete s.categories[key];
    return { ok: true, key, category: body.category ?? null };
  },
  "/adjustments/remove": (s, _q, body) => {
    delete s.adjustments[body.key];
    return { ok: true };
  },
};

const NOT_IN_DEMO = /^\/(upload|sync|cal\/sync|warm-analyzer)/;

/**
 * Answer an API call for the demo. `url` is the full request URL; `/api/demo/x` and `/api/x`
 * mean the same thing here. Returns undefined for calls that should still go to the network.
 */
export function demoRequest(method: string, url: string, body?: unknown): { data: unknown } | undefined {
  const u = new URL(url, "http://demo.local");
  const path = u.pathname.replace(/^.*?\/api(\/demo)?/, "");
  if (path.startsWith("/auth")) return undefined;
  if (NOT_IN_DEMO.test(path)) {
    throw new Error("Not available in the demo — sign in to upload or sync your own statements.");
  }
  const s = load();
  if (method === "DELETE" && path.startsWith("/statements/")) {
    const key = decodeURIComponent(path.slice("/statements/".length));
    if (!s.deleted_months.includes(key)) s.deleted_months.push(key);
    save();
    return { data: { ok: true, key, total_months: visibleStatements(s).length } };
  }
  const table = method === "GET" ? GET : WRITE;
  const handler = table[path];
  if (!handler) throw new Error(`Demo: ${method} ${path} is not available`);
  // Copies, so screens can't change the stored state behind our back.
  const data = JSON.parse(JSON.stringify(handler(s, u.searchParams, body) ?? null));
  if (method !== "GET" && path !== "/review/hints") save();
  return { data };
}
