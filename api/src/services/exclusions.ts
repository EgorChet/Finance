import { readFileSync } from "fs";
import path from "path";
import type { ExcludedEntry, ExcludedItemView, ExclusionsData, SpendingReport, Transaction } from "../types.js";
import { readExclusions, writeExclusions } from "../storage/index.js";
import { rebuildReportSummaries } from "./fixedCharges.js";
import { normalizeReviewKey } from "./reviewService.js";

const BUILTIN_PATH = path.resolve(
  process.env.DATA_DIR ? path.dirname(process.env.DATA_DIR) : path.join(process.cwd(), ".."),
  "data",
  "excluded_transactions.json",
);

let cachedKeys: Set<string> | null = null;
let cachedEntries: ExcludedEntry[] | null = null;

function loadBuiltinEntries(): ExcludedEntry[] {
  try {
    const raw = readFileSync(BUILTIN_PATH, "utf-8");
    const data = JSON.parse(raw) as { entries?: ExcludedEntry[] };
    return (data.entries || []).map((e) => ({
      key: normalizeReviewKey(e.key.trim()),
      note: e.note,
      source: "builtin" as const,
    }));
  } catch {
    return [];
  }
}

function mergeExclusions(user: ExclusionsData): ExcludedEntry[] {
  const restored = new Set((user.restored_keys || []).map(normalizeReviewKey));
  const byKey = new Map<string, ExcludedEntry>();

  for (const entry of loadBuiltinEntries()) {
    if (!entry.key || restored.has(entry.key)) continue;
    byKey.set(entry.key, entry);
  }

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

export function enrichExclusion(entry: ExcludedEntry): ExcludedItemView {
  const parsed = parseExclusionKey(entry.key);
  return {
    ...entry,
    ...parsed,
    can_restore: true,
  };
}

export async function listExclusions(): Promise<ExcludedItemView[]> {
  await refreshExclusionsCache();
  return (cachedEntries || []).map(enrichExclusion);
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
  return enrichExclusion(
    entry || { key: normalized, note: note?.trim(), added_at: new Date().toISOString(), source: "user" },
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
