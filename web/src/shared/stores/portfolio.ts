import { defineStore } from "pinia";
import { ref } from "vue";
import {
  fetchFxcnQuote,
  fetchKaspaQuote,
  fetchMarketSnapshot,
  type FxcnQuote,
  type KaspaQuote,
  type MarketSnapshot,
} from "@/shared/api/client";

const KAS_REFRESH_MS = 600_000;
const FXCN_REFRESH_MS = 6 * 60 * 60 * 1000;
const MARKET_REFRESH_MS = 600_000;

export const usePortfolioStore = defineStore("portfolio", () => {
  const kaspaQuote = ref<KaspaQuote | null>(null);
  const fxcnQuote = ref<FxcnQuote | null>(null);
  const marketSnapshot = ref<MarketSnapshot | null>(null);
  const loading = ref(false);
  const refreshing = ref(false);
  /** True once the first round of quotes has finished (answered or failed), so screens know the numbers are settled. */
  const ready = ref(false);

  let kaspaTimer: ReturnType<typeof setInterval> | null = null;
  let fxcnTimer: ReturnType<typeof setInterval> | null = null;
  let marketTimer: ReturnType<typeof setInterval> | null = null;
  let pollStarted = false;

  async function refresh(demo: boolean, token?: string, force = false) {
    if (force) refreshing.value = true;
    else loading.value = true;
    // Each quote lands on its own, so one slow or failing source does not hold back the others.
    await Promise.allSettled([
      fetchKaspaQuote(demo, token, force).then((v) => (kaspaQuote.value = v)),
      fetchFxcnQuote(demo, token, force).then((v) => (fxcnQuote.value = v)),
      fetchMarketSnapshot(demo, token, force).then((v) => (marketSnapshot.value = v)),
    ]);
    loading.value = false;
    refreshing.value = false;
    ready.value = true;
  }

  function startPolling(demo: boolean, token?: string) {
    if (pollStarted) return;
    pollStarted = true;
    void refresh(demo, token);
    kaspaTimer = setInterval(() => void refresh(demo, token), KAS_REFRESH_MS);
    fxcnTimer = setInterval(() => void refresh(demo, token), FXCN_REFRESH_MS);
    marketTimer = setInterval(() => void refresh(demo, token), MARKET_REFRESH_MS);
  }

  function stopPolling() {
    pollStarted = false;
    if (kaspaTimer) {
      clearInterval(kaspaTimer);
      kaspaTimer = null;
    }
    if (fxcnTimer) {
      clearInterval(fxcnTimer);
      fxcnTimer = null;
    }
    if (marketTimer) {
      clearInterval(marketTimer);
      marketTimer = null;
    }
  }

  return {
    kaspaQuote,
    fxcnQuote,
    marketSnapshot,
    loading,
    refreshing,
    ready,
    refresh,
    startPolling,
    stopPolling,
  };
});
