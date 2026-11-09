import { useHomeDataStore } from "@/features/home/stores/homeData";
import { useReviewDataStore } from "@/features/merchants/stores/reviewData";
import { useAdjustmentsDataStore, useHouseholdDataStore, useRulesDataStore } from "@/shared/stores/viewData";

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

/** Pull-to-refresh: forget every cached screen so the next load comes from the server. */
export function invalidateAllDataCaches() {
  useHomeDataStore().invalidate();
  useReviewDataStore().invalidate();
  useHouseholdDataStore().invalidate();
  useRulesDataStore().invalidate();
  useAdjustmentsDataStore().invalidate();
}
