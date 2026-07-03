import type {
  ExcludedEntry,
  ExcludedItemView,
  ExclusionsData,
  MerchantRules,
  SpendingReport,
  Transaction,
} from "../types.js";
import { readExclusions, readFixedCharges, readRules, writeExclusions } from "../storage/index.js";
import { rebuildReportSummaries } from "./fixedCharges.js";
import { normalizeReviewKey, suggestEnglish } from "./reviewService.js";

let cachedKeys: Set<string> | null = null;
let cachedEntries: ExcludedEntry[] | null = null;

function mergeExclusions(user: ExclusionsData): ExcludedEntry[] {
  const restored = new Set((user.restored_keys || []).map(normalizeReviewKey));
  const byKey = new Map<string, ExcludedEntry>();

  for (const entry of user.entries || []) {
    const key = normalizeReviewKey(entry.key.trim());
    if (!key || restored.has(key)) continue;
    byKey.set(key, {
      key,
      note: entry.note,
      added_at: entry.added_at,
      source: "user",
    });
  }

  return [...byKey.values()].sort((a, b) => b.key.localeCompare(a.key));
}

export async function refreshExclusionsCache(): Promise<void> {
  const user = await readExclusions();
  cachedEntries = mergeExclusions(user);
  cachedKeys = new Set(cachedEntries.map((e) => e.key));
}

function ensureCache(): void {
  if (!cachedKeys || !cachedEntries) {
    const merged = mergeExclusions({ entries: [], restored_keys: [] });
    cachedEntries = merged;
    cachedKeys = new Set(merged.map((e) => e.key));
  }
}

export function loadExcludedKeys(): Set<string> {
  ensureCache();
  return cachedKeys!;
}

export function transactionKey(tx: Transaction): string {
  return `${tx.date}|${tx.merchant_he}|${tx.charge_amount.toFixed(2)}`;
}

export function isExcluded(tx: Transaction, excluded = loadExcludedKeys()): boolean {
  return excluded.has(transactionKey(tx));
}

export function applyExclusions(report: SpendingReport): SpendingReport {
  const excluded = loadExcludedKeys();
  if (!excluded.size) return report;
  const transactions = report.transactions.filter((tx) => !isExcluded(tx, excluded));
  if (transactions.length === report.transactions.length) return report;
  return rebuildReportSummaries({ ...report, transactions });
}

export function parseExclusionKey(key: string): { date?: string; merchant_he?: string; amount?: number } {
  const normalized = normalizeReviewKey(key);
  const parts = normalized.split("|");
  if (parts.length < 3) return {};
  const amount = Number.parseFloat(parts[2]!);
  return {
    date: parts[0],
    merchant_he: parts[1],
    amount: Number.isFinite(amount) ? amount : undefined,
  };
}

export function enrichExclusion(
  entry: ExcludedEntry,
  rules: MerchantRules = {},
  fixedChargeNames = new Map<string, string>(),
): ExcludedItemView {
  const parsed = parseExclusionKey(entry.key);
  const merchantHe = parsed.merchant_he?.trim();
  let merchantEn: string | undefined;
  if (merchantHe) {
    const fromRules = suggestEnglish(merchantHe, rules);
    if (fromRules) merchantEn = fromRules;
    else merchantEn = fixedChargeNames.get(merchantHe);
  }
  return {
    ...entry,
    ...parsed,
    merchant_en: merchantEn || undefined,
    can_restore: true,
  };
}

async function exclusionEnrichmentContext(): Promise<{
  rules: MerchantRules;
  fixedChargeNames: Map<string, string>;
}> {
  const [rules, fixed] = await Promise.all([readRules(), readFixedCharges()]);
  const fixedChargeNames = new Map<string, string>();
  for (const charge of fixed.charges || []) {
    const en = charge.name_en?.trim();
    if (!en) continue;
    if (charge.name_he?.trim()) fixedChargeNames.set(charge.name_he.trim(), en);
    fixedChargeNames.set(en, en);
  }
  return { rules, fixedChargeNames };
}

export async function listExclusions(): Promise<ExcludedItemView[]> {
  await refreshExclusionsCache();
  const ctx = await exclusionEnrichmentContext();
  return (cachedEntries || []).map((entry) => enrichExclusion(entry, ctx.rules, ctx.fixedChargeNames));
}

export async function addExclusion(key: string, note?: string): Promise<ExcludedItemView> {
  const normalized = normalizeReviewKey(key.trim());
  if (!normalized) throw new Error("Invalid exclusion key");

  const user = await readExclusions();
  const restored = new Set((user.restored_keys || []).map(normalizeReviewKey));
  restored.delete(normalized);

  const entries = (user.entries || []).filter((e) => normalizeReviewKey(e.key) !== normalized);
  entries.push({
    key: normalized,
    note: note?.trim() || undefined,
    added_at: new Date().toISOString(),
    source: "user",
  });

  await writeExclusions({
    ...user,
    entries,
    restored_keys: [...restored],
  });
  await refreshExclusionsCache();

  const entry = cachedEntries?.find((e) => e.key === normalized);
  const ctx = await exclusionEnrichmentContext();
  return enrichExclusion(
    entry || { key: normalized, note: note?.trim(), added_at: new Date().toISOString(), source: "user" },
    ctx.rules,
    ctx.fixedChargeNames,
  );
}

export async function removeExclusion(key: string): Promise<void> {
  const normalized = normalizeReviewKey(key.trim());
  if (!normalized) throw new Error("Invalid exclusion key");

  const user = await readExclusions();
  const restored = new Set((user.restored_keys || []).map(normalizeReviewKey));
  restored.add(normalized);

  const entries = (user.entries || []).filter((e) => normalizeReviewKey(e.key) !== normalized);

  await writeExclusions({
    ...user,
    entries,
    restored_keys: [...restored],
  });
  await refreshExclusionsCache();
}
