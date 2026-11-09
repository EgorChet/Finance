/**
 * Hints for labelling a Hebrew merchant in Review: a translation, what the bank calls it,
 * what else was paid that day, earlier charges at the same place, and Totoshka's guess.
 *
 * Totoshka (the Telegram assistant) works by pulling: it fetches merchants that still need
 * a guess (GET /review/to-guess), decides an English name + category + reason, and posts them
 * back (POST /review/suggestions). The app never calls a paid model API itself.
 * Contract: docs/TOTOSHKA.md.
 */
import { CATEGORY_PICKLIST } from "../../../core/categories.js";
import { readLabelSuggestions, writeLabelSuggestions } from "../storage/index.js";
import type { ReviewQueueItem, Transaction } from "../types.js";
import { translateMerchant } from "./analyzerClient.js";

export interface LabelSuggestion {
  english_name: string;
  category: string;
  confidence: "low" | "medium" | "high";
  reason: string;
  source: "totoshka";
  at: string;
}

export interface LabelHints {
  translation: string;
  bank_category: string | null;
  bank_category_he: string | null;
  same_day: { merchant: string; category: string; amount: number }[];
  history: { date: string; amount: number }[];
  ai: LabelSuggestion | null;
  /** waiting = Totoshka hasn't looked at this merchant yet. */
  ai_status: "ok" | "waiting";
}

const HEBREW_RE = /[֐-׿]/;
const CONFIDENCE = new Set(["low", "medium", "high"]);
const translationCache = new Map<string, string>();

function displayName(tx: Transaction): string {
  const en = tx.merchant_en?.trim();
  if (en && !HEBREW_RE.test(en)) return en;
  return tx.merchant_he.trim();
}

async function translate(hebrew: string): Promise<string> {
  if (!HEBREW_RE.test(hebrew)) return hebrew;
  const cached = translationCache.get(hebrew);
  if (cached != null) return cached;
  try {
    const english = await translateMerchant(hebrew);
    translationCache.set(hebrew, english);
    return english;
  } catch {
    return "";
  }
}

export async function loadLabelSuggestions(): Promise<Record<string, LabelSuggestion>> {
  const raw = (await readLabelSuggestions()) as { suggestions?: Record<string, LabelSuggestion> } | null;
  return raw?.suggestions ?? {};
}

function sameDayFor(all: Transaction[], hebrew: string, day: string) {
  return all
    .filter((t) => t.date.slice(0, 10) === day && t.merchant_he.trim() !== hebrew && t.charge_amount > 0)
    .sort((a, b) => b.charge_amount - a.charge_amount)
    .slice(0, 8)
    .map((t) => ({ merchant: displayName(t), category: t.category_en || "Uncategorized", amount: t.charge_amount }));
}

function historyFor(all: Transaction[], hebrew: string) {
  const seen = new Set<string>();
  return all
    .filter((t) => t.merchant_he.trim() === hebrew)
    .map((t) => ({ date: t.date.slice(0, 10), amount: t.charge_amount }))
    .filter((h) => {
      const k = `${h.date}|${h.amount}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);
}

export async function buildLabelHints(
  allTransactions: Transaction[],
  target: { merchant_he: string; date: string; charge_amount: number; category_he?: string | null; category_en?: string },
  options: { suggestions?: Record<string, LabelSuggestion> } = {},
): Promise<LabelHints> {
  const hebrew = target.merchant_he.trim();
  const suggestions = options.suggestions ?? (await loadLabelSuggestions());
  const ai = suggestions[hebrew] ?? null;
  return {
    translation: await translate(hebrew),
    bank_category: target.category_en && target.category_en !== "Uncategorized" ? target.category_en : null,
    bank_category_he: target.category_he?.trim() || null,
    same_day: sameDayFor(allTransactions, hebrew, target.date.slice(0, 10)),
    history: historyFor(allTransactions, hebrew),
    ai,
    ai_status: ai ? "ok" : "waiting",
  };
}

/** Merchants in the Review queue that Totoshka hasn't guessed yet, with the context to guess them. */
export async function buildGuessQueue(allTransactions: Transaction[], queue: ReviewQueueItem[], limit: number) {
  const suggestions = await loadLabelSuggestions();
  const seen = new Set<string>();
  const out = [];
  for (const item of queue) {
    const hebrew = item.transaction.merchant_he.trim();
    if (!hebrew || seen.has(hebrew) || suggestions[hebrew]) continue;
    seen.add(hebrew);
    out.push({
      merchant_he: hebrew,
      bank_category_he: item.transaction.category_he?.trim() || null,
      bank_category: item.transaction.category_en || null,
      example: { date: item.transaction.date.slice(0, 10), amount: item.transaction.charge_amount },
      charges: item.occurrence_count,
      history: historyFor(allTransactions, hebrew),
      same_day: sameDayFor(allTransactions, hebrew, item.transaction.date.slice(0, 10)),
    });
    if (out.length >= limit) break;
  }
  return { categories: [...CATEGORY_PICKLIST], merchants: out };
}

/** Validate and store Totoshka's guesses. Returns how many were saved and why others were skipped. */
export async function saveLabelSuggestions(input: unknown): Promise<{ saved: number; skipped: { merchant_he?: string; reason: string }[] }> {
  const items = Array.isArray(input) ? input : [];
  const current = await loadLabelSuggestions();
  const skipped: { merchant_he?: string; reason: string }[] = [];
  let saved = 0;
  const now = new Date().toISOString();
  for (const raw of items.slice(0, 200)) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const hebrew = typeof r.merchant_he === "string" ? r.merchant_he.trim() : "";
    const english = typeof r.english_name === "string" ? r.english_name.trim() : "";
    const category = typeof r.category === "string" ? r.category.trim() : "";
    const confidence = typeof r.confidence === "string" && CONFIDENCE.has(r.confidence) ? r.confidence : "medium";
    const reason = typeof r.reason === "string" ? r.reason.trim().slice(0, 300) : "";
    if (!hebrew) { skipped.push({ reason: "merchant_he missing" }); continue; }
    if (!english || english.length > 80) { skipped.push({ merchant_he: hebrew, reason: "english_name missing or too long" }); continue; }
    if (!(CATEGORY_PICKLIST as readonly string[]).includes(category)) {
      skipped.push({ merchant_he: hebrew, reason: `category must be one of the listed categories, got "${category}"` });
      continue;
    }
    current[hebrew] = {
      english_name: english,
      category,
      confidence: confidence as LabelSuggestion["confidence"],
      reason,
      source: "totoshka",
      at: now,
    };
    saved += 1;
  }
  if (saved) await writeLabelSuggestions({ suggestions: current, updated_at: now });
  return { saved, skipped };
}
