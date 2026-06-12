import type { MerchantRules, ReviewQueueItem, SpendingReport, Transaction } from "../types.js";

const HEBREW_RE = /[\u0590-\u05FF]/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Stable key — date + merchant + amount only (billing month caused mismatches). */
export function transactionKey(tx: Transaction): string {
  return `${tx.date}|${tx.merchant_he}|${tx.charge_amount.toFixed(2)}`;
}

/** Normalize legacy keys: |date|… or Month YYYY|date|… → date|merchant|amount */
export function normalizeReviewKey(key: string): string {
  const parts = key.split("|");
  const dateIdx = parts.findIndex((p) => DATE_RE.test(p));
  if (dateIdx === -1) return key;
  const merchant = parts[dateIdx + 1];
  const amount = parts[dateIdx + 2];
  if (!merchant || amount === undefined) return key;
  return `${parts[dateIdx]}|${merchant}|${amount}`;
}

export function isReviewed(
  tx: Transaction,
  reviewed: Set<string>,
  reviewedMerchants: Set<string>,
): boolean {
  if (reviewedMerchants.has(tx.merchant_he)) return true;
  return reviewed.has(transactionKey(tx));
}

function looksHebrew(text: string): boolean {
  return HEBREW_RE.test(text);
}

function getRule(rules: MerchantRules, hebrew: string) {
  return rules[hebrew] || null;
}

export function suggestEnglish(hebrew: string, rules: MerchantRules): string {
  const rule = getRule(rules, hebrew);
  if (rule?.english && !looksHebrew(rule.english)) return rule.english.trim();
  if (!looksHebrew(hebrew)) return hebrew.trim();
  return "";
}

function effectiveEnglish(tx: Transaction, rules: MerchantRules): string {
  const fromRules = suggestEnglish(tx.merchant_he, rules);
  if (fromRules) return fromRules;
  const en = (tx.merchant_en || "").trim();
  if (en && !looksHebrew(en) && en !== tx.merchant_he.trim()) return en;
  return "";
}

export function needsReview(tx: Transaction, rules: MerchantRules): boolean {
  const rule = getRule(rules, tx.merchant_he);
  // Only skip when you saved a rule — auto-translate alone still needs your confirm.
  if (rule?.english && !looksHebrew(rule.english) && rule.category) return false;
  return true;
}

export function buildReviewQueue(
  report: SpendingReport,
  rules: MerchantRules,
  reviewed: Set<string>,
  options: {
    skippedKeys?: Set<string>;
    includeReviewed?: boolean;
    includeLabeled?: boolean;
    onePerMerchant?: boolean;
    reviewedMerchants?: Set<string>;
  },
): ReviewQueueItem[] {
  const {
    skippedKeys = new Set(),
    includeReviewed = false,
    includeLabeled = false,
    onePerMerchant = true,
    reviewedMerchants = new Set(),
  } = options;

  let queue = report.transactions.filter((tx) => {
    const key = transactionKey(tx);
    if (!includeReviewed && isReviewed(tx, reviewed, reviewedMerchants)) return false;
    if (skippedKeys.has(key)) return false;
    if (!includeLabeled && !needsReview(tx, rules)) return false;
    return true;
  });

  if (onePerMerchant) {
    const seen = new Set<string>();
    queue = queue.filter((tx) => {
      if (seen.has(tx.merchant_he)) return false;
      seen.add(tx.merchant_he);
      return true;
    });
  }

  const counts = new Map<string, number>();
  for (const tx of report.transactions) {
    counts.set(tx.merchant_he, (counts.get(tx.merchant_he) || 0) + 1);
  }

  return queue.map((tx) => ({
    key: transactionKey(tx),
    transaction: tx,
    display_english: effectiveEnglish(tx, rules),
    occurrence_count: counts.get(tx.merchant_he) || 1,
  }));
}

export function merchantCatalog(report: SpendingReport, rules: MerchantRules) {
  const merchants = new Map<string, { Hebrew: string; English: string; Category: string }>();
  for (const tx of report.transactions) {
    if (merchants.has(tx.merchant_he)) continue;
    const rule = getRule(rules, tx.merchant_he);
    merchants.set(tx.merchant_he, {
      Hebrew: tx.merchant_he,
      English: rule?.english || tx.merchant_en || "",
      Category: rule?.category || tx.category_en || "",
    });
  }
  return [...merchants.values()].sort((a, b) => a.Hebrew.localeCompare(b.Hebrew));
}
