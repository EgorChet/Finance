import type { Transaction } from "@/shared/types";
import { subscriptionVendor } from "@/features/spending/utils/subscriptions";

const MOBILE_RE =
  /\bcellcom\b|hot\s*mobile|הוט\s*מובייל|pelephone|פלאפון|סלקום|\bgolan\b|גולן|partner\s*mobile|012\s*mobile|wecom|019\s*mobile/i;

const FITNESS_RE = /fitness|\bgym\b|כושר|raybo|רייבו/i;

/** Subsection label when drilling into Subscriptions. */
export function subscriptionSubsectionLabel(tx: Transaction): string {
  if (tx.category_en === "Mobile phone") return "Mobile phone";
  if (tx.category_en === "Fitness") return "Fitness";
  const text = `${tx.merchant_he} ${tx.merchant_en}`;
  if (MOBILE_RE.test(text)) return "Mobile phone";
  if (FITNESS_RE.test(text)) return "Fitness";
  return subscriptionVendor(tx.merchant_en || tx.merchant_he);
}

export function subscriptionSubsectionTotals(
  transactions: Transaction[],
): { name: string; total: number }[] {
  const map = new Map<string, number>();
  for (const tx of transactions) {
    const label = subscriptionSubsectionLabel(tx);
    map.set(label, (map.get(label) || 0) + tx.charge_amount);
  }
  return [...map.entries()]
    .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}
