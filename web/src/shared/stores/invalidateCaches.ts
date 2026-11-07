import { useHomeDataStore } from "@/features/home/stores/homeData";
import { useReviewDataStore } from "@/features/merchants/stores/reviewData";
import { useHouseholdDataStore, useRulesDataStore } from "@/shared/stores/viewData";

/** Invalidate caches that change after statement sync or upload. */
export function invalidateSpendingDataCaches() {
  useHomeDataStore().invalidate();
  useReviewDataStore().invalidate();
}

/** Invalidate caches touched by household settings or exclusions. */
export function invalidateHouseholdDataCaches() {
  useHomeDataStore().invalidate();
  useHouseholdDataStore().invalidate();
}

export function invalidateRulesDataCaches() {
  useRulesDataStore().invalidate();
  useReviewDataStore().invalidate();
}
