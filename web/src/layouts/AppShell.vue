<template>
  <div class="app-layout">
    <header class="app-header">
      <button
        type="button"
        class="btn btn-icon mobile-nav-toggle"
        aria-label="Open menu"
        :aria-expanded="navOpen"
        @click="navOpen = !navOpen"
      >
        <span class="hamburger-icon" :class="{ 'hamburger-icon--open': navOpen }">
          <span /><span /><span />
        </span>
      </button>
      <div class="app-header-brand">
        <div class="app-portfolio-switch">
          <div class="app-portfolio-tabs" role="tablist" aria-label="Portfolio asset">
            <button
              type="button"
              class="app-portfolio-tab"
              :class="{ 'app-portfolio-tab--active': portfolioAsset === 'kas' }"
              role="tab"
              :aria-selected="portfolioAsset === 'kas'"
              @click="setPortfolioAsset('kas')"
            >
              KAS
            </button>
            <button
              type="button"
              class="app-portfolio-tab"
              :class="{ 'app-portfolio-tab--active': portfolioAsset === 'fxcn' }"
              role="tab"
              :aria-selected="portfolioAsset === 'fxcn'"
              @click="setPortfolioAsset('fxcn')"
            >
              FXCN
            </button>
          </div>
          <button
            type="button"
            class="app-portfolio-refresh"
            :disabled="portfolioRefreshing"
            :aria-label="portfolioRefreshLabel"
            @click="refreshPortfolioQuote(true)"
          >
            <span
              class="app-portfolio-refresh-icon"
              :class="{ 'app-portfolio-refresh-icon--spin': portfolioRefreshing }"
              aria-hidden="true"
            >↻</span>
          </button>
        </div>
        <div
          v-if="portfolioStripVisible"
          class="app-kaspa-strip"
          :class="{ 'app-kaspa-strip--stale': portfolioStale }"
          :title="portfolioTitle"
        >
          <img v-if="portfolioAsset === 'kas'" class="app-kaspa-logo" :src="kaspaLogo" alt="" width="18" height="18" />
          <span class="app-kaspa-item">{{ portfolioPriceLabel }}</span>
          <span class="app-kaspa-sep" aria-hidden="true">·</span>
          <span class="app-kaspa-item app-kaspa-portfolio">{{ portfolioValueLabel }}</span>
        </div>
      </div>
    </header>

    <Teleport to="body">
      <template v-if="navOpen">
        <div class="mobile-nav-backdrop" aria-hidden="true" @click="closeNav" />
        <nav class="mobile-nav-drawer" aria-label="Main navigation">
          <div class="mobile-nav-drawer-head">
            <span class="mobile-nav-drawer-title">Menu</span>
            <button type="button" class="btn btn-icon mobile-nav-close" aria-label="Close menu" @click="closeNav">
              ×
            </button>
          </div>
          <div class="mobile-nav-links">
            <RouterLink
              v-for="item in navItems"
              :key="item.to"
              class="mobile-nav-link"
              :to="item.to"
              @click="closeNav"
            >
              {{ item.label }}
            </RouterLink>
          </div>
          <div class="mobile-nav-bottom">
            <div v-if="sideMenuPortfolioVisible" class="mobile-nav-portfolio">
              <div
                v-if="kaspaQuote"
                class="mobile-nav-portfolio-row"
                :class="{
                  'mobile-nav-portfolio-row--active': portfolioAsset === 'kas',
                  'mobile-nav-portfolio-row--stale': kaspaQuote.stale,
                }"
                :title="kasPortfolioTitle"
              >
                <img class="mobile-nav-portfolio-logo" :src="kaspaLogo" alt="" width="18" height="18" />
                <span class="mobile-nav-portfolio-price">{{ formatKasUsdtPrice(kaspaQuote.price_usdt) }}</span>
                <span class="mobile-nav-portfolio-sep" aria-hidden="true">·</span>
                <span class="mobile-nav-portfolio-total">{{ formatUsdt(kaspaQuote.portfolio_usdt, 0) }}</span>
              </div>
              <div
                v-if="fxcnQuote"
                class="mobile-nav-portfolio-row"
                :class="{
                  'mobile-nav-portfolio-row--active': portfolioAsset === 'fxcn',
                  'mobile-nav-portfolio-row--stale': fxcnQuote.stale,
                }"
                :title="fxcnPortfolioTitle"
              >
                <span class="mobile-nav-portfolio-label">FXCN</span>
                <span class="mobile-nav-portfolio-price">{{ formatFxcnNavPrice(fxcnQuote.nav_usd) }}</span>
                <span class="mobile-nav-portfolio-sep" aria-hidden="true">·</span>
                <span class="mobile-nav-portfolio-total">{{ formatUsd(fxcnQuote.portfolio_usd, 0) }}</span>
              </div>
              <div
                v-if="portfolioCombinedUsd != null"
                class="mobile-nav-portfolio-row mobile-nav-portfolio-row--combined"
                :title="portfolioCombinedTitle"
              >
                <span class="mobile-nav-portfolio-label">Total</span>
                <span class="mobile-nav-portfolio-values">
                  <span>{{ formatUsd(portfolioCombinedUsd, 0) }}</span>
                  <template v-if="portfolioCombinedIls != null">
                    <span class="mobile-nav-portfolio-sep" aria-hidden="true">·</span>
                    <span>{{ formatIls(portfolioCombinedIls, 0) }}</span>
                  </template>
                  <template v-if="portfolioCombinedRub != null">
                    <span class="mobile-nav-portfolio-sep" aria-hidden="true">·</span>
                    <span>{{ formatRub(portfolioCombinedRub, 0) }}</span>
                  </template>
                </span>
              </div>
              <div v-if="marketSnapshot?.btc_usd" class="mobile-nav-portfolio-row mobile-nav-portfolio-row--market">
                <span class="mobile-nav-portfolio-label">BTC</span>
                <span class="mobile-nav-portfolio-total">{{ formatUsd(marketSnapshot.btc_usd, 0) }}</span>
              </div>
              <div v-if="marketSnapshot?.sp500" class="mobile-nav-portfolio-row mobile-nav-portfolio-row--market">
                <span class="mobile-nav-portfolio-label">S&amp;P</span>
                <span class="mobile-nav-portfolio-total">{{ formatSp500(marketSnapshot.sp500) }}</span>
              </div>
            </div>
            <div class="mobile-nav-footer">
            <label class="mobile-nav-action">
              <ToggleSwitch :model-value="app.lightMode" @update:model-value="onLightModeChange" />
              Light mode
            </label>
            <template v-if="!auth.isDemo">
              <button
                v-if="showLocalSync"
                type="button"
                class="mobile-nav-action btn"
                :disabled="processing"
                @click="sync"
              >
                Sync .xlsx files
              </button>
              <input ref="uploadInput" type="file" accept=".xlsx" hidden @change="onUpload" />
              <button
                type="button"
                class="mobile-nav-action btn"
                :disabled="processing"
                @click="uploadInput?.click()"
              >
                Upload statement
              </button>
            </template>
            <button
              v-if="auth.authRequired && auth.isAuthenticated"
              type="button"
              class="mobile-nav-action btn"
              @click="logout"
            >
              Sign out
            </button>
            <button v-if="auth.isDemo" type="button" class="mobile-nav-action btn" @click="goLogin">
              Sign in for real data
            </button>
            <p v-else-if="auth.userLabel" class="mobile-nav-user">
              Signed in as <strong>{{ auth.userLabel }}</strong>
            </p>
            </div>
          </div>
        </nav>
      </template>
    </Teleport>

    <main class="main">
      <RouterView />
    </main>

    <AppLoader
      v-if="processing"
      overlay
      :title="processTitle"
      :subtitle="processSubtitle"
      :steps="processSteps"
      :active-step="processStep"
    />

    <div v-if="processError" class="process-error-overlay" role="alertdialog" aria-modal="true">
      <div class="process-error-card">
        <h3>{{ processErrorTitle }}</h3>
        <p>{{ processError }}</p>
        <div class="process-error-actions">
          <button type="button" class="btn" @click="dismissProcessError">Dismiss</button>
          <button v-if="canRetry" type="button" class="btn btn-primary" @click="retryProcess">Try again</button>
        </div>
      </div>
    </div>

    <div v-if="uploadPromptFile" class="process-error-overlay" role="dialog" aria-modal="true">
      <div class="process-error-card upload-type-card">
        <h3>Statement type</h3>
        <p class="upload-type-file">{{ uploadPromptFile.name }}</p>
        <p class="upload-type-hint">
          Exports around the <strong>10th–13th</strong> are often still incomplete — pick
          <strong>Partial</strong> unless this file is the full official bill for the cycle.
          <strong>Final</strong> closes the month (pace tab, projections) — use only when nothing is missing.
        </p>
        <div class="process-error-actions upload-type-actions">
          <button type="button" class="btn" @click="cancelUploadPrompt">Cancel</button>
          <button type="button" class="btn btn-primary" @click="confirmUpload('partial')">Partial snapshot</button>
          <button type="button" class="btn" @click="confirmUpload('final')">Final — closes cycle</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppLoader from "../components/AppLoader.vue";
import ToggleSwitch from "../components/ToggleSwitch.vue";
import { fetchAppConfig, fetchFxcnQuote, fetchKaspaQuote, fetchMarketSnapshot, syncStatements, uploadStatement, warmAnalyzerService } from "../api/client";
import type { FxcnQuote, KaspaQuote, MarketSnapshot } from "../api/client";
import { wakeAnalyzerInBrowser } from "../api/wakeAnalyzer";
import { useAppStore } from "../stores/app";
import { useAuthStore } from "../stores/auth";
import { goToSignIn } from "../utils/signIn";
import { formatFxcnNavPrice, formatIls, formatKasUsdtPrice, formatRub, formatSp500, formatUsd, formatUsdt } from "../utils/format";
import kaspaLogo from "../assets/kaspa.png";

/** v2 — default header asset is KAS (v1 may have persisted FXCN). */
const PORTFOLIO_ASSET_KEY = "portfolio_header_asset_v2";
type PortfolioAsset = "kas" | "fxcn";

function readPortfolioAsset(): PortfolioAsset {
  try {
    return localStorage.getItem(PORTFOLIO_ASSET_KEY) === "fxcn" ? "fxcn" : "kas";
  } catch {
    return "kas";
  }
}

const UPLOAD_STEPS = [
  "Connecting to server",
  "Reading spreadsheet",
  "Analysing expenses",
  "Categorizing merchants",
  "Saving statement",
];

const SYNC_STEPS = [
  "Scanning statements folder",
  "Reading spreadsheets",
  "Analysing expenses",
  "Applying merchant rules",
  "Saving updates",
];

const NAV_ITEMS = [
  { to: "/app/home", label: "Home" },
  { to: "/app/overview", label: "Spending" },
  { to: "/app/calendar", label: "Calendar" },
  { to: "/app/browse", label: "Browse" },
  { to: "/app/mappings", label: "Mappings" },
  { to: "/app/review", label: "Label" },
  { to: "/app/excluded", label: "Excluded" },
  { to: "/app/recurring", label: "Extra charges" },
] as const;

const navItems = NAV_ITEMS;

const app = useAppStore();

function onLightModeChange(value: boolean) {
  if (value !== app.lightMode) app.toggleTheme();
}
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const processing = ref(false);
const processTitle = ref("");
const processSubtitle = ref("");
const processSteps = ref<string[]>([]);
const processStep = ref(0);
const processError = ref("");
const processErrorTitle = ref("Something went wrong");
const canRetry = ref(false);
const retryProcessFn = ref<(() => void) | null>(null);
const uploadInput = ref<HTMLInputElement | null>(null);
const uploadPromptFile = ref<File | null>(null);
const navOpen = ref(false);
const kaspaQuote = ref<KaspaQuote | null>(null);
const fxcnQuote = ref<FxcnQuote | null>(null);
const marketSnapshot = ref<MarketSnapshot | null>(null);
const portfolioAsset = ref<PortfolioAsset>(readPortfolioAsset());
const portfolioRefreshing = ref(false);
let stepTimer: ReturnType<typeof setInterval> | null = null;
let kaspaTimer: ReturnType<typeof setInterval> | null = null;
let fxcnTimer: ReturnType<typeof setInterval> | null = null;
let marketTimer: ReturnType<typeof setInterval> | null = null;

const KAS_REFRESH_MS = 600_000;
const FXCN_REFRESH_MS = 6 * 60 * 60 * 1000;
const MARKET_REFRESH_MS = 600_000;

const sideMenuPortfolioVisible = computed(
  () =>
    !!kaspaQuote.value ||
    !!fxcnQuote.value ||
    portfolioCombinedUsd.value != null ||
    !!marketSnapshot.value?.btc_usd ||
    !!marketSnapshot.value?.sp500,
);

const portfolioCombinedUsd = computed(() => {
  let total = 0;
  if (kaspaQuote.value) total += kaspaQuote.value.portfolio_usdt;
  if (fxcnQuote.value) total += fxcnQuote.value.portfolio_usd;
  return total > 0 ? total : null;
});

const portfolioCombinedIls = computed(() => {
  const usd = portfolioCombinedUsd.value;
  const rate = marketSnapshot.value?.usd_ils;
  return usd != null && rate ? Math.round(usd * rate) : null;
});

const portfolioCombinedRub = computed(() => {
  const usd = portfolioCombinedUsd.value;
  const rate = marketSnapshot.value?.usd_rub;
  return usd != null && rate ? Math.round(usd * rate) : null;
});

const portfolioCombinedTitle = computed(() => {
  const usd = portfolioCombinedUsd.value;
  if (usd == null) return "";
  const parts = [formatUsd(usd)];
  if (portfolioCombinedIls.value != null) parts.push(formatIls(portfolioCombinedIls.value, 0));
  if (portfolioCombinedRub.value != null) parts.push(formatRub(portfolioCombinedRub.value, 0));
  return `Combined portfolio · ${parts.join(" · ")}`;
});

const portfolioStripVisible = computed(() =>
  portfolioAsset.value === "kas" ? !!kaspaQuote.value : !!fxcnQuote.value,
);

const portfolioStale = computed(() =>
  portfolioAsset.value === "kas" ? !!kaspaQuote.value?.stale : !!fxcnQuote.value?.stale,
);

const portfolioPriceLabel = computed(() => {
  if (portfolioAsset.value === "kas" && kaspaQuote.value) {
    return formatKasUsdtPrice(kaspaQuote.value.price_usdt);
  }
  if (portfolioAsset.value === "fxcn" && fxcnQuote.value) {
    return formatFxcnNavPrice(fxcnQuote.value.nav_usd);
  }
  return "";
});

const portfolioValueLabel = computed(() => {
  if (portfolioAsset.value === "kas" && kaspaQuote.value) {
    return formatUsdt(kaspaQuote.value.portfolio_usdt, 0);
  }
  if (portfolioAsset.value === "fxcn" && fxcnQuote.value) {
    return formatUsd(fxcnQuote.value.portfolio_usd, 0);
  }
  return "";
});

const portfolioRefreshLabel = computed(() =>
  portfolioAsset.value === "kas" ? "Refresh KAS price" : "Refresh FXCN NAV",
);

const kasPortfolioTitle = computed(() => {
  if (!kaspaQuote.value) return "";
  const { price_usdt, balance_kas, portfolio_usdt, source, stale } = kaspaQuote.value;
  const staleNote = stale ? " · cached" : "";
  return `Kaspa ${formatKasUsdtPrice(price_usdt)} · ${balance_kas.toLocaleString("en-US", { maximumFractionDigits: 3 })} KAS · ${formatUsdt(portfolio_usdt)} · ${source}${staleNote}`;
});

const fxcnPortfolioTitle = computed(() => {
  if (!fxcnQuote.value) return "";
  const { nav_usd, lots, portfolio_usd, source, stale } = fxcnQuote.value;
  const staleNote = stale ? " · cached" : "";
  return `FXCN ${formatFxcnNavPrice(nav_usd)} · ${lots} shares · ${formatUsd(portfolio_usd)} · ${source}${staleNote}`;
});

const portfolioTitle = computed(() => {
  if (portfolioAsset.value === "kas") return kasPortfolioTitle.value;
  if (portfolioAsset.value === "fxcn") return fxcnPortfolioTitle.value;
  return "";
});

function setPortfolioAsset(asset: PortfolioAsset) {
  portfolioAsset.value = asset;
  localStorage.setItem(PORTFOLIO_ASSET_KEY, asset);
  void refreshPortfolioQuote();
}

async function refreshKaspaQuote(force = false) {
  try {
    kaspaQuote.value = await fetchKaspaQuote(auth.isDemo, auth.token || undefined, force);
  } catch {
    /* keep last quote */
  }
}

async function refreshFxcnQuote(force = false) {
  try {
    fxcnQuote.value = await fetchFxcnQuote(auth.isDemo, auth.token || undefined, force);
  } catch {
    /* keep last quote */
  }
}

async function refreshMarketSnapshot(force = false) {
  try {
    marketSnapshot.value = await fetchMarketSnapshot(auth.isDemo, auth.token || undefined, force);
  } catch {
    /* keep last snapshot */
  }
}

async function refreshPortfolioQuote(force = false) {
  if (portfolioRefreshing.value) return;
  portfolioRefreshing.value = true;
  try {
    if (portfolioAsset.value === "kas") {
      await refreshKaspaQuote(force);
    } else {
      await refreshFxcnQuote(force);
    }
  } finally {
    portfolioRefreshing.value = false;
  }
}

function closeNav() {
  navOpen.value = false;
}

watch(
  () => route.path,
  () => {
    navOpen.value = false;
  },
);

watch(navOpen, (open) => {
  document.body.style.overflow = open ? "hidden" : "";
});

const showLocalSync = computed(() => !import.meta.env.VITE_API_URL);

onMounted(() => {
  void refreshKaspaQuote();
  void refreshFxcnQuote();
  void refreshMarketSnapshot();
  kaspaTimer = setInterval(() => void refreshKaspaQuote(), KAS_REFRESH_MS);
  fxcnTimer = setInterval(() => void refreshFxcnQuote(), FXCN_REFRESH_MS);
  marketTimer = setInterval(() => void refreshMarketSnapshot(), MARKET_REFRESH_MS);
});

onUnmounted(() => {
  clearStepTimer();
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
  document.body.style.overflow = "";
});

function clearStepTimer() {
  if (stepTimer) {
    clearInterval(stepTimer);
    stepTimer = null;
  }
}

function startStepTimer(maxStep: number) {
  clearStepTimer();
  stepTimer = setInterval(() => {
    if (processStep.value < maxStep) processStep.value += 1;
  }, 2200);
}

function beginProcess(title: string, subtitle: string, steps: string[]) {
  processing.value = true;
  processError.value = "";
  processTitle.value = title;
  processSubtitle.value = subtitle;
  processSteps.value = steps;
  processStep.value = 0;
}

function failProcess(title: string, message: string, retry?: () => void) {
  processing.value = false;
  clearStepTimer();
  processErrorTitle.value = title;
  processError.value = message;
  canRetry.value = !!retry;
  retryProcessFn.value = retry ?? null;
}

function dismissProcessError() {
  processError.value = "";
  canRetry.value = false;
  retryProcessFn.value = null;
}

function retryProcess() {
  const fn = retryProcessFn.value;
  dismissProcessError();
  fn?.();
}

async function runUpload(file: File, statementType: "partial" | "final") {
  beginProcess(
    "Processing statement",
    statementType === "partial" ? `${file.name} · partial snapshot` : file.name,
    UPLOAD_STEPS,
  );
  try {
    processStep.value = 0;
    if (import.meta.env.VITE_API_URL) {
      processSubtitle.value = "Waking analyzer — first upload after idle can take 1–2 minutes…";
      const config = await fetchAppConfig(auth.token || undefined);
      const wakeUrl =
        config.analyzer_wake_url ||
        (import.meta.env.VITE_ANALYZER_URL as string | undefined)?.trim() ||
        null;
      if (wakeUrl) {
        await wakeAnalyzerInBrowser(wakeUrl);
      } else {
        await warmAnalyzerService(auth.token || undefined);
      }
    }
    startStepTimer(UPLOAD_STEPS.length - 2);
    await uploadStatement(file, statementType, auth.token || undefined);
    clearStepTimer();
    processStep.value = UPLOAD_STEPS.length - 1;
    processSubtitle.value = "Done — refreshing your overview…";
    await new Promise((r) => setTimeout(r, 500));
    window.location.reload();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failProcess("Upload failed", message, () => runUpload(file, statementType));
  }
}

async function sync() {
  closeNav();
  beginProcess("Syncing statements", "Reading files from your statements folder", SYNC_STEPS);
  try {
    startStepTimer(SYNC_STEPS.length - 2);
    await syncStatements(auth.token || undefined);
    clearStepTimer();
    processStep.value = SYNC_STEPS.length - 1;
    processSubtitle.value = "Done — refreshing your overview…";
    await new Promise((r) => setTimeout(r, 500));
    window.location.reload();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failProcess("Sync failed", message, sync);
  }
}

function cancelUploadPrompt() {
  uploadPromptFile.value = null;
}

function confirmUpload(statementType: "partial" | "final") {
  const file = uploadPromptFile.value;
  uploadPromptFile.value = null;
  if (!file) return;
  void runUpload(file, statementType);
}

async function onUpload(e: Event) {
  closeNav();
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  uploadPromptFile.value = file;
}

function logout() {
  closeNav();
  auth.logout();
  router.push("/");
}

function goLogin() {
  closeNav();
  void goToSignIn(router);
}
</script>
