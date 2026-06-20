<template>
  <section class="home-card home-card-portfolio">
    <header class="home-card-head">
      <h3 class="home-card-title">Portfolio</h3>
      <button
        v-if="!loading"
        type="button"
        class="btn btn-ghost home-card-action"
        :disabled="refreshing"
        @click="$emit('refresh')"
      >
        {{ refreshing ? "Refreshing…" : "Refresh" }}
      </button>
    </header>
    <AppLoader v-if="loading" title="Loading portfolio" subtitle="Fetching quotes" />
    <template v-else>
      <p v-if="combinedUsd != null" class="home-portfolio-hero">
        {{ formatUsd(combinedUsd, 0) }}
        <span v-if="combinedIls != null" class="home-portfolio-hero-sub">· {{ formatIls(combinedIls, 0) }}</span>
      </p>
      <ul class="home-portfolio-rows">
        <li v-if="kaspa" class="home-portfolio-row" :class="{ 'home-portfolio-row--stale': kaspa.stale }">
          <div class="home-portfolio-row-left">
            <img class="home-portfolio-logo" :src="kaspaLogo" alt="" width="18" height="18" />
            <span class="home-portfolio-label">KAS</span>
            <span class="home-portfolio-value">{{ formatUsdt(kaspa.portfolio_usdt, 0) }}</span>
          </div>
          <span class="home-portfolio-meta">{{ formatKasUsdtPrice(kaspa.price_usdt) }}</span>
        </li>
        <li v-if="fxcn" class="home-portfolio-row" :class="{ 'home-portfolio-row--stale': fxcn.stale }">
          <div class="home-portfolio-row-left">
            <span class="home-portfolio-label">FXCN</span>
            <span class="home-portfolio-value">{{ formatUsd(fxcn.portfolio_usd, 0) }}</span>
          </div>
          <span class="home-portfolio-meta">{{ formatFxcnNavPrice(fxcn.nav_usd) }}</span>
        </li>
      </ul>
      <div v-if="market?.btc_usd || market?.sp500" class="home-market-strip">
        <span v-if="market?.btc_usd">BTC {{ formatUsd(market.btc_usd, 0) }}</span>
        <span v-if="market?.btc_usd && market?.sp500" aria-hidden="true"> · </span>
        <span v-if="market?.sp500">S&amp;P {{ formatSp500(market.sp500) }}</span>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { FxcnQuote, KaspaQuote, MarketSnapshot } from "../../api/client";
import AppLoader from "../AppLoader.vue";
import kaspaLogo from "../../assets/kaspa.png";
import {
  formatFxcnNavPrice,
  formatIls,
  formatKasUsdtPrice,
  formatSp500,
  formatUsd,
  formatUsdt,
} from "../../utils/format";

const props = defineProps<{
  loading: boolean;
  refreshing?: boolean;
  kaspa: KaspaQuote | null;
  fxcn: FxcnQuote | null;
  market: MarketSnapshot | null;
}>();

defineEmits<{ refresh: [] }>();

const combinedUsd = computed(() => {
  let total = 0;
  if (props.kaspa) total += props.kaspa.portfolio_usdt;
  if (props.fxcn) total += props.fxcn.portfolio_usd;
  return total > 0 ? total : null;
});

const combinedIls = computed(() => {
  const usd = combinedUsd.value;
  const rate = props.market?.usd_ils;
  return usd != null && rate ? Math.round(usd * rate) : null;
});
</script>
