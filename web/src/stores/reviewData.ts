import { defineStore } from "pinia";
import { ref } from "vue";
import { fetchReviewQueue } from "../api/client";
import type { CacheLoadOptions } from "./createCachedStore";

export type ReviewQueueOptions = {
  includeReviewed: boolean;
  includeLabeled: boolean;
  onePerMerchant: boolean;
};

export type ReviewQueueBundle = Awaited<ReturnType<typeof fetchReviewQueue>>;

function reviewCacheKey(demo: boolean, token: string | undefined, opts: ReviewQueueOptions): string {
  return `${demo}:${token ?? ""}:${opts.includeReviewed}:${opts.includeLabeled}:${opts.onePerMerchant}`;
}

export const useReviewDataStore = defineStore("reviewData", () => {
  const data = ref<ReviewQueueBundle | null>(null);
  const loading = ref(false);
  const refreshing = ref(false);

  let activeKey = "";
  let requestId = 0;

  function peek(demo: boolean, token: string | undefined, opts: ReviewQueueOptions): ReviewQueueBundle | null {
    const key = reviewCacheKey(demo, token, opts);
    if (data.value && activeKey === key) return data.value;
    return null;
  }

  function invalidate() {
    data.value = null;
    activeKey = "";
  }

  async function load(
    demo: boolean,
    token: string | undefined,
    opts: ReviewQueueOptions,
    options: CacheLoadOptions = {},
  ): Promise<ReviewQueueBundle> {
    const key = reviewCacheKey(demo, token, opts);
    const cached = data.value && activeKey === key ? data.value : null;

    if (cached && !options.background && !options.force) {
      void load(demo, token, opts, { background: true });
      return cached;
    }

    const reqId = ++requestId;
    if (options.background) refreshing.value = true;
    else loading.value = true;

    try {
      const result = await fetchReviewQueue(demo, opts, token);
      if (reqId !== requestId) return data.value ?? result;
      data.value = result;
      activeKey = key;
      return result;
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

  return { data, loading, refreshing, peek, invalidate, load };
});
