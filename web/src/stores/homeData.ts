import { fetchHomeData } from "../api/client";
import { DEFAULT_PACE_MONTHS } from "../utils/paceMonths";
import { createCachedStore } from "./createCachedStore";

export type HomeDataBundle = Awaited<ReturnType<typeof fetchHomeData>>;

export const useHomeDataStore = createCachedStore(
  "homeData",
  (demo, token) => fetchHomeData(demo, token, DEFAULT_PACE_MONTHS),
  (demo, token) => `${demo}:${token ?? ""}:${DEFAULT_PACE_MONTHS}`,
);
