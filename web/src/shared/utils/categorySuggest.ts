import type { Transaction } from "@/shared/types";
import { isBitTransfer } from "@/shared/composables/useChargeCategory";

/** Categories BIT transfers usually turn out to be, before you've sorted any. */
const BIT_DEFAULTS = ["Eating out", "Beauty & Personal Care", "Groceries", "Leisure & Entertainment"];

/** Most-picked first, then the defaults, no repeats, at most `max`. */
function topOf(counts: Map<string, number>, fallback: string[], max: number, skip: Set<string>): string[] {
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const out: string[] = [];
  for (const c of [...ranked, ...fallback]) {
    if (out.length >= max) break;
    if (!skip.has(c) && !out.includes(c)) out.push(c);
  }
  return out;
}

/** What you usually say BIT transfers were for (from the ones you've already sorted). */
export function bitSuggestions(transactions: readonly Transaction[], max = 4): string[] {
  const counts = new Map<string, number>();
  for (const t of transactions) {
    if (!t.category_override || !isBitTransfer(t)) continue;
    counts.set(t.category_override, (counts.get(t.category_override) ?? 0) + 1);
  }
  return topOf(counts, BIT_DEFAULTS, max, new Set(["BIT", "Uncategorized"]));
}

/** Suggestions for one charge: BIT gets your BIT habits; a store gets its own category, then your most used ones. */
export function chargeSuggestions(tx: Transaction, transactions: readonly Transaction[], max = 4): string[] {
  if (isBitTransfer(tx)) return bitSuggestions(transactions, max);
  const counts = new Map<string, number>();
  for (const t of transactions) counts.set(t.category_en, (counts.get(t.category_en) ?? 0) + 1);
  const own = tx.category_original ?? tx.category_en;
  const first = own && own !== "Uncategorized" ? [own] : [];
  return topOf(counts, first, max, new Set(["BIT", "Uncategorized"])).sort((a, b) => (a === own ? -1 : b === own ? 1 : 0));
}
