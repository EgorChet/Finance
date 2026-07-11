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
    const reimbursement = roundMoney(Number(entry.reimbursement));
    if (!key || reimbursement <= 0) continue;
    byKey.set(key, {
      key,
      reimbursement,
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

export function applyAdjustments(report: SpendingReport): SpendingReport {
  const adjustments = loadAdjustments();
  if (!adjustments.size) return report;

  let changed = false;
  const transactions = report.transactions.map((tx) => {
    const entry = adjustments.get(transactionKey(tx));
    if (!entry) {
      if (tx.reimbursement != null || tx.effective_amount != null) {
        changed = true;
        const {
          reimbursement: _r,
          effective_amount: _e,
          reimbursement_note: _n,
          ...rest
        } = tx;
        return rest;
      }
      return tx;
    }

    const reimbursement = Math.min(roundMoney(entry.reimbursement), roundMoney(tx.charge_amount));
    const effective = roundMoney(Math.max(0, tx.charge_amount - reimbursement));
    if (
      tx.reimbursement === reimbursement
      && tx.effective_amount === effective
      && (tx.reimbursement_note ?? undefined) === entry.note
    ) {
      return tx;
    }
    changed = true;
    return {
      ...tx,
      reimbursement,
      effective_amount: effective,
      reimbursement_note: entry.note,
    };
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
  const entries = (user.entries || []).filter((e) => normalizeReviewKey(e.key) !== normalized);
  entries.push({
    key: normalized,
    reimbursement: amount,
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

export async function removeAdjustment(key: string): Promise<void> {
  const normalized = normalizeReviewKey(key.trim());
  if (!normalized) throw new Error("Invalid adjustment key");

  const user = await readAdjustments();
  const entries = (user.entries || []).filter((e) => normalizeReviewKey(e.key) !== normalized);
  await writeAdjustments({ ...user, entries });
  await refreshAdjustmentsCache();
}
