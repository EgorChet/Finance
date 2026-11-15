import { defineStore } from "pinia";
import { ref } from "vue";
import { confirmReview, fetchReviewQueue, fetchRules } from "@/shared/api/client";
import { canonicalMerchantName } from "@/shared/utils/merchantNames";
import type { ReviewQueueItem } from "@/shared/types";
import type { CacheLoadOptions } from "@/shared/stores/createCachedStore";

export type ReviewQueueOptions = {
  includeReviewed: boolean;
  includeLabeled: boolean;
  onePerMerchant: boolean;
};

export type ReviewQueueBundle = Awaited<ReturnType<typeof fetchReviewQueue>>;

function reviewCacheKey(demo: boolean, token: string | undefined, opts: ReviewQueueOptions): string {
  return `${demo}:${token ?? ""}:${opts.includeReviewed}:${opts.includeLabeled}:${opts.onePerMerchant}`;
}

/**
 * A new spelling of a brand you've already named ("APPLE.COM/BILL ITUNES.COM IE" after
 * "APPLE.COM/BILL") is saved straight away with the same name and category, so it never waits
 * in "To label". Only brands we're sure about (canonical names) and only when a saved one exists.
 */
async function autoNameKnownBrands(
  bundle: ReviewQueueBundle,
  demo: boolean,
  token: string | undefined,
): Promise<ReviewQueueBundle> {
  let rules: Record<string, { english: string; category?: string | null }>;
  try {
    rules = await fetchRules(demo, token);
  } catch {
    return bundle;
  }
  const byName = new Map<string, Map<string, number>>();
  for (const r of Object.values(rules)) {
    const name = r.english?.trim().toLowerCase();
    if (!name) continue;
    const cats = byName.get(name) ?? new Map<string, number>();
    if (r.category) cats.set(r.category, (cats.get(r.category) ?? 0) + 1);
    byName.set(name, cats);
  }
  const done = new Set<string>();
  let reviewed = bundle.reviewed_count;
  for (const item of bundle.queue as ReviewQueueItem[]) {
    const he = item.transaction.merchant_he;
    if (done.has(he)) continue;
    const brand = canonicalMerchantName(he, item.transaction.merchant_en);
    const cats = brand ? byName.get(brand.toLowerCase()) : undefined;
    if (!brand || !cats) continue;
    const category = [...cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    try {
      const res = await confirmReview(
        { hebrew: he, english: brand, category: category ?? undefined, mark_all_merchant: true, keys: [item.key] },
        token,
      );
      reviewed = res.reviewed_count;
      done.add(he);
    } catch {
      /* leave it in the queue */
    }
  }
  if (!done.size) return bundle;
  const queue = bundle.queue.filter((q) => !done.has(q.transaction.merchant_he));
  return { ...bundle, queue, total: queue.length, reviewed_count: reviewed };
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
      let result = await fetchReviewQueue(demo, opts, token);
      if (!opts.includeLabeled && !opts.includeReviewed && result.queue.length) {
        result = await autoNameKnownBrands(result, demo, token);
      }
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
