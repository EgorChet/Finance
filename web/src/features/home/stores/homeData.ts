import { fetchHomeData } from "@/shared/api/client";
import { DEFAULT_PACE_MONTHS } from "@/features/spending/utils/paceMonths";
import { createCachedStore } from "@/shared/stores/createCachedStore";

export type HomeDataBundle = Awaited<ReturnType<typeof fetchHomeData>>;

export const useHomeDataStore = createCachedStore(
  "homeData",
  (demo, token) => fetchHomeData(demo, token, DEFAULT_PACE_MONTHS),
  (demo, token) => `${demo}:${token ?? ""}:${DEFAULT_PACE_MONTHS}`,
);
