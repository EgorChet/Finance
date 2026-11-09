import { setChargeCategory } from "@/shared/api/client";
import { useAuthStore } from "@/shared/stores/auth";
import { useAdjustmentsDataStore } from "@/shared/stores/viewData";
import { emitSpendingRefresh } from "@/features/spending/composables/useSpendingRefresh";
import type { Transaction } from "@/shared/types";

/** BIT transfers all share one merchant name, so their category is set per charge. */
export function isBitTransfer(tx: Pick<Transaction, "merchant_he" | "merchant_en" | "category_en" | "category_original">): boolean {
  if ((tx.category_original ?? tx.category_en) === "BIT") return true;
  return /\bbit\b|העברה\s*ב\s*bit/i.test(`${tx.merchant_he} ${tx.merchant_en ?? ""}`);
}

/** Save one charge's category (null = back to the merchant's category) and refresh every view. */
export async function saveChargeCategory(tx: Transaction, category: string | null): Promise<void> {
  const auth = useAuthStore();
  await setChargeCategory(tx, category, auth.token || undefined);
  useAdjustmentsDataStore().invalidate();
  emitSpendingRefresh();
}
