import type {
  AdjustmentEntry,
  AdjustmentItemView,
  AdjustmentsData,
  MerchantRules,
  SpendingReport,
  Transaction,
} from "../types.js";
import { readAdjustments, readFixedCharges, readRules, writeAdjustments } from "../storage/index.js";
import { rebuildReportSummaries } from "./fixedCharges.js";
import { parseExclusionKey } from "./exclusions.js";
import { normalizeReviewKey, suggestEnglish } from "./reviewService.js";
import { transactionKey } from "./exclusions.js";

let cachedByKey: Map<string, AdjustmentEntry> | null = null;

function mergeAdjustments(user: AdjustmentsData): AdjustmentEntry[] {
  const byKey = new Map<string, AdjustmentEntry>();
  for (const entry of user.entries || []) {
    const key = normalizeReviewKey(entry.key.trim());
    const reimbursement = Math.max(0, roundMoney(Number(entry.reimbursement) || 0));
    const category = entry.category?.trim() || undefined;
    if (!key || (reimbursement <= 0 && !category)) continue;
    byKey.set(key, {
      key,
      reimbursement,
      ...(category ? { category } : {}),
      note: entry.note?.trim() || undefined,
      added_at: entry.added_at,
    });
  }
  return [...byKey.values()].sort((a, b) => b.key.localeCompare(a.key));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function refreshAdjustmentsCache(): Promise<void> {
  const user = await readAdjustments();
  cachedByKey = new Map(mergeAdjustments(user).map((entry) => [entry.key, entry]));
}

function ensureCache(): void {
  if (!cachedByKey) cachedByKey = new Map();
}

export function loadAdjustments(): Map<string, AdjustmentEntry> {
  ensureCache();
  return cachedByKey!;
}

/** Strip any previous adjustment, then apply `entry` (split and/or category). Returns tx unchanged if nothing differs. */
function applyEntry(tx: Transaction, entry: AdjustmentEntry | undefined): Transaction {
  const {
    reimbursement: _r,
    effective_amount: _e,
    reimbursement_note: _n,
    category_override: _co,
    category_original: originalCategory,
    ...base
  } = tx;
  const clean: Transaction = { ...base, category_en: originalCategory ?? tx.category_en };
  let next = clean;
  if (entry && entry.reimbursement > 0) {
    const reimbursement = Math.min(roundMoney(entry.reimbursement), roundMoney(tx.charge_amount));
    next = {
      ...next,
      reimbursement,
      effective_amount: roundMoney(Math.max(0, tx.charge_amount - reimbursement)),
      reimbursement_note: entry.note,
    };
  }
  if (entry?.category && entry.category !== clean.category_en) {
    next = { ...next, category_en: entry.category, category_override: entry.category, category_original: clean.category_en };
  }
  const same =
    next.category_en === tx.category_en &&
    next.category_override === tx.category_override &&
    next.category_original === tx.category_original &&
    next.reimbursement === tx.reimbursement &&
    next.effective_amount === tx.effective_amount &&
    (next.reimbursement_note ?? undefined) === (tx.reimbursement_note ?? undefined);
  return same ? tx : next;
}

export function applyAdjustments(report: SpendingReport): SpendingReport {
  const adjustments = loadAdjustments();
  if (!adjustments.size && !report.transactions.some((t) => t.category_original || t.reimbursement != null)) {
    return report;
  }

  let changed = false;
  const transactions = report.transactions.map((tx) => {
    const entry = adjustments.get(transactionKey(tx));
    const next = applyEntry(tx, entry);
    if (next !== tx) changed = true;
    return next;
  });

  if (!changed) return report;
  return rebuildReportSummaries({ ...report, transactions });
}

function adjustmentEnrichmentContext(): Promise<{
  rules: MerchantRules;
  fixedChargeNames: Map<string, string>;
}> {
  return Promise.all([readRules(), readFixedCharges()]).then(([rules, fixed]) => {
    const fixedChargeNames = new Map<string, string>();
    for (const charge of fixed.charges || []) {
      const en = charge.name_en?.trim();
      if (!en) continue;
      if (charge.name_he?.trim()) fixedChargeNames.set(charge.name_he.trim(), en);
      fixedChargeNames.set(en, en);
    }
    return { rules, fixedChargeNames };
  });
}

export function enrichAdjustment(
  entry: AdjustmentEntry,
  rules: MerchantRules = {},
  fixedChargeNames = new Map<string, string>(),
): AdjustmentItemView {
  const parsed = parseExclusionKey(entry.key);
  const merchantHe = parsed.merchant_he?.trim();
  let merchantEn: string | undefined;
  if (merchantHe) {
    const fromRules = suggestEnglish(merchantHe, rules);
    if (fromRules) merchantEn = fromRules;
    else merchantEn = fixedChargeNames.get(merchantHe);
  }
  const amount = parsed.amount;
  const effective = amount != null ? roundMoney(Math.max(0, amount - entry.reimbursement)) : undefined;
  return {
    ...entry,
    ...parsed,
    merchant_en: merchantEn || undefined,
    effective_amount: effective,
    can_remove: true,
  };
}

export async function listAdjustments(): Promise<AdjustmentItemView[]> {
  await refreshAdjustmentsCache();
  const ctx = await adjustmentEnrichmentContext();
  return [...loadAdjustments().values()].map((entry) =>
    enrichAdjustment(entry, ctx.rules, ctx.fixedChargeNames),
  );
}

export async function upsertAdjustment(
  key: string,
  reimbursement: number,
  note?: string,
): Promise<AdjustmentItemView> {
  const normalized = normalizeReviewKey(key.trim());
  if (!normalized) throw new Error("Invalid adjustment key");

  const amount = roundMoney(reimbursement);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Reimbursement must be greater than zero");

  const user = await readAdjustments();
  const previous = (user.entries || []).find((e) => normalizeReviewKey(e.key) === normalized);
  const entries = (user.entries || []).filter((e) => normalizeReviewKey(e.key) !== normalized);
  entries.push({
    key: normalized,
    reimbursement: amount,
    ...(previous?.category ? { category: previous.category } : {}),
    note: note?.trim() || undefined,
    added_at: new Date().toISOString(),
  });

  await writeAdjustments({ ...user, entries });
  await refreshAdjustmentsCache();

  const entry = loadAdjustments().get(normalized);
  const ctx = await adjustmentEnrichmentContext();
  return enrichAdjustment(
    entry || { key: normalized, reimbursement: amount, note: note?.trim(), added_at: new Date().toISOString() },
    ctx.rules,
    ctx.fixedChargeNames,
  );
}

/** Set (or clear with null) the category of one charge, keeping any split on it. */
export async function setChargeCategory(key: string, category: string | null): Promise<void> {
  const normalized = normalizeReviewKey(key.trim());
  if (!normalized) throw new Error("Invalid adjustment key");
  const cat = category?.trim() || "";
  if (cat.length > 60) throw new Error("Category name too long");

  const user = await readAdjustments();
  const previous = (user.entries || []).find((e) => normalizeReviewKey(e.key) === normalized);
  const entries = (user.entries || []).filter((e) => normalizeReviewKey(e.key) !== normalized);
  const reimbursement = previous?.reimbursement ?? 0;
  if (cat || reimbursement > 0) {
    entries.push({
      key: normalized,
      reimbursement,
      ...(cat ? { category: cat } : {}),
      note: previous?.note,
      added_at: previous?.added_at ?? new Date().toISOString(),
    });
  }
  await writeAdjustments({ ...user, entries });
  await refreshAdjustmentsCache();
}

export async function removeAdjustment(key: string): Promise<void> {
  const normalized = normalizeReviewKey(key.trim());
  if (!normalized) throw new Error("Invalid adjustment key");

  const user = await readAdjustments();
  const entries = (user.entries || []).filter((e) => normalizeReviewKey(e.key) !== normalized);
  await writeAdjustments({ ...user, entries });
  await refreshAdjustmentsCache();
}
