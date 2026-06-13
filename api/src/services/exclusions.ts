import { readFileSync } from "fs";
import path from "path";
import type { SpendingReport, Transaction } from "../types.js";
import { rebuildReportSummaries } from "./fixedCharges.js";
import { normalizeReviewKey } from "./reviewService.js";

interface ExcludedEntry {
  key: string;
  note?: string;
}

interface ExcludedFile {
  entries: ExcludedEntry[];
}

const EXCLUSIONS_PATH = path.resolve(
  process.env.DATA_DIR ? path.dirname(process.env.DATA_DIR) : path.join(process.cwd(), ".."),
  "data",
  "excluded_transactions.json",
);

let cachedKeys: Set<string> | null = null;

export function loadExcludedKeys(): Set<string> {
  if (cachedKeys) return cachedKeys;
  try {
    const raw = readFileSync(EXCLUSIONS_PATH, "utf-8");
    const data = JSON.parse(raw) as ExcludedFile;
    cachedKeys = new Set(
      (data.entries || []).map((e) => normalizeReviewKey(e.key.trim())).filter(Boolean),
    );
  } catch {
    cachedKeys = new Set();
  }
  return cachedKeys;
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
