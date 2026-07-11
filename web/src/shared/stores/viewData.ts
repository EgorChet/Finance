import { fetchAdjustments, fetchCalendar, fetchExclusions, fetchFixedCharges, fetchLivingBudget, fetchRules } from "@/shared/api/client";
import { createCachedStore } from "@/shared/stores/createCachedStore";

export const useCalendarDataStore = createCachedStore("calendarData", fetchCalendar);

export const useRulesDataStore = createCachedStore("rulesData", fetchRules);

export const useExclusionsDataStore = createCachedStore("exclusionsData", async (demo, token) => {
  const data = await fetchExclusions(demo, token);
  return data.entries;
});

export const useAdjustmentsDataStore = createCachedStore("adjustmentsData", async (demo, token) => {
  const data = await fetchAdjustments(demo, token);
  return data.entries;
});

export type HouseholdBundle = {
  charges: Awaited<ReturnType<typeof fetchFixedCharges>>["charges"];
  living_budget: Awaited<ReturnType<typeof fetchLivingBudget>>;
};

export const useHouseholdDataStore = createCachedStore<HouseholdBundle>("householdData", async (demo, token) => {
  const [chargesData, budgetData] = await Promise.all([
    fetchFixedCharges(demo, token),
    fetchLivingBudget(demo, token),
  ]);
  return { charges: chargesData.charges, living_budget: budgetData };
});
