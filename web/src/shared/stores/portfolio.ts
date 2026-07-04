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

  let kaspaTimer: ReturnType<typeof setInterval> | null = null;
  let fxcnTimer: ReturnType<typeof setInterval> | null = null;
  let marketTimer: ReturnType<typeof setInterval> | null = null;
  let pollStarted = false;

  async function refresh(demo: boolean, token?: string, force = false) {
    if (force) refreshing.value = true;
    else loading.value = true;
    try {
      const [kas, fxcn, market] = await Promise.all([
        fetchKaspaQuote(demo, token, force),
        fetchFxcnQuote(demo, token, force),
        fetchMarketSnapshot(demo, token, force),
      ]);
      kaspaQuote.value = kas;
      fxcnQuote.value = fxcn;
      marketSnapshot.value = market;
    } catch {
      /* keep stale values */
    } finally {
      loading.value = false;
      refreshing.value = false;
    }
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
    refresh,
    startPolling,
    stopPolling,
  };
});
