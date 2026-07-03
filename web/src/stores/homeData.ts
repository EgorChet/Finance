import { defineStore } from "pinia";
import { ref } from "vue";
import { fetchHomeData } from "../api/client";
import { DEFAULT_PACE_MONTHS } from "../utils/paceMonths";

export type HomeDataBundle = Awaited<ReturnType<typeof fetchHomeData>>;

function cacheKeyFor(demo: boolean, token: string | undefined, paceMonths: number): string {
  return `${demo}:${token ?? ""}:${paceMonths}`;
}

export const useHomeDataStore = defineStore("homeData", () => {
  const bundle = ref<HomeDataBundle | null>(null);
  const loading = ref(false);
  const refreshing = ref(false);

  let activeKey = "";
  let requestId = 0;

  function peek(
    demo: boolean,
    token: string | undefined,
    paceMonths = DEFAULT_PACE_MONTHS,
  ): HomeDataBundle | null {
    const key = cacheKeyFor(demo, token, paceMonths);
    if (bundle.value && activeKey === key) return bundle.value;
    return null;
  }

  function invalidate() {
    bundle.value = null;
    activeKey = "";
  }

  async function load(
    demo: boolean,
    token: string | undefined,
    paceMonths = DEFAULT_PACE_MONTHS,
    options: { background?: boolean; force?: boolean } = {},
  ): Promise<HomeDataBundle> {
    const key = cacheKeyFor(demo, token, paceMonths);
    const cached = bundle.value && activeKey === key ? bundle.value : null;

    if (cached && !options.background && !options.force) {
      void load(demo, token, paceMonths, { background: true });
      return cached;
    }

    const reqId = ++requestId;
    if (options.background) refreshing.value = true;
    else loading.value = true;

    try {
      const data = await fetchHomeData(demo, token, paceMonths);
      if (reqId !== requestId) return bundle.value ?? data;
      bundle.value = data;
      activeKey = key;
      return data;
    } catch (e) {
      if (cached) return cached;
      throw e;
    } finally {
      if (reqId === requestId) {
        loading.value = false;
        refreshing.value = false;
      }
    }
  }

  return { bundle, loading, refreshing, peek, invalidate, load };
});
