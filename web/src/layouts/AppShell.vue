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
          <span v-else class="app-portfolio-badge">FXCN</span>
          <span class="app-kaspa-item">{{ portfolioPriceLabel }}</span>
          <span class="app-kaspa-sep" aria-hidden="true">·</span>
          <span class="app-kaspa-item app-kaspa-portfolio">{{ portfolioValueLabel }}</span>
        </div>
      </div>
      <div class="app-header-actions">
        <button type="button" class="btn btn-icon" aria-label="Menu" @click="menuOpen = !menuOpen">⋯</button>
        <div v-if="menuOpen" class="app-menu-backdrop" @click="menuOpen = false" />
        <div v-if="menuOpen" class="app-menu">
          <label class="app-menu-item">
            <input type="checkbox" :checked="app.lightMode" @change="app.toggleTheme()" />
            Light mode
          </label>
          <template v-if="!auth.isDemo">
            <button
              v-if="showLocalSync"
              type="button"
              class="app-menu-item btn"
              :disabled="processing"
              @click="sync"
            >
              Sync .xlsx files
            </button>
            <input ref="uploadInput" type="file" accept=".xlsx" hidden @change="onUpload" />
            <button
              type="button"
              class="app-menu-item btn"
              :disabled="processing"
              @click="uploadInput?.click()"
            >
              Upload statement
            </button>
          </template>
          <button
            v-if="auth.authRequired && auth.isAuthenticated"
            type="button"
            class="app-menu-item btn"
            @click="logout"
          >
            Sign out
          </button>
          <button v-if="auth.isDemo" type="button" class="app-menu-item btn" @click="goLogin">
            Sign in for real data
          </button>
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
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            class="mobile-nav-link"
            :to="item.to"
            @click="closeNav"
          >
            {{ item.label }}
          </RouterLink>
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
import { fetchAppConfig, fetchFxcnQuote, fetchKaspaQuote, syncStatements, uploadStatement, warmAnalyzerService } from "../api/client";
import type { FxcnQuote, KaspaQuote } from "../api/client";
import { wakeAnalyzerInBrowser } from "../api/wakeAnalyzer";
import { useAppStore } from "../stores/app";
import { useAuthStore } from "../stores/auth";
import { formatFxcnNavPrice, formatKasUsdtPrice, formatUsd, formatUsdt } from "../utils/format";
import kaspaLogo from "../assets/kaspa.png";

const PORTFOLIO_ASSET_KEY = "portfolio_header_asset";
type PortfolioAsset = "kas" | "fxcn";

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
  { to: "/app/overview", label: "Overview" },
  { to: "/app/browse", label: "Browse" },
  { to: "/app/mappings", label: "Mappings" },
  { to: "/app/review", label: "Label" },
  { to: "/app/excluded", label: "Excluded" },
  { to: "/app/recurring", label: "Extra charges" },
] as const;

const navItems = NAV_ITEMS;

const app = useAppStore();
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
const menuOpen = ref(false);
const navOpen = ref(false);
const kaspaQuote = ref<KaspaQuote | null>(null);
const fxcnQuote = ref<FxcnQuote | null>(null);
const portfolioAsset = ref<PortfolioAsset>(
  (localStorage.getItem(PORTFOLIO_ASSET_KEY) as PortfolioAsset | null) === "fxcn" ? "fxcn" : "kas",
);
const portfolioRefreshing = ref(false);
let stepTimer: ReturnType<typeof setInterval> | null = null;
let kaspaTimer: ReturnType<typeof setInterval> | null = null;
let fxcnTimer: ReturnType<typeof setInterval> | null = null;

const KAS_REFRESH_MS = 600_000;
const FXCN_REFRESH_MS = 6 * 60 * 60 * 1000;

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

const portfolioTitle = computed(() => {
  if (portfolioAsset.value === "kas" && kaspaQuote.value) {
    const { price_usdt, balance_kas, portfolio_usdt, source, stale } = kaspaQuote.value;
    const staleNote = stale ? " · cached" : "";
    return `Kaspa ${formatKasUsdtPrice(price_usdt)} · ${balance_kas.toLocaleString("en-US", { maximumFractionDigits: 3 })} KAS · ${formatUsdt(portfolio_usdt)} · ${source}${staleNote}`;
  }
  if (portfolioAsset.value === "fxcn" && fxcnQuote.value) {
    const { nav_usd, lots, portfolio_usd, source, stale } = fxcnQuote.value;
    const staleNote = stale ? " · cached" : "";
    return `FXCN ${formatFxcnNavPrice(nav_usd)} · ${lots} shares · ${formatUsd(portfolio_usd)} · ${source}${staleNote}`;
  }
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
  kaspaTimer = setInterval(() => void refreshKaspaQuote(), KAS_REFRESH_MS);
  fxcnTimer = setInterval(() => void refreshFxcnQuote(), FXCN_REFRESH_MS);
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
  menuOpen.value = false;
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
  menuOpen.value = false;
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  uploadPromptFile.value = file;
}

function logout() {
  menuOpen.value = false;
  auth.logout();
  router.push("/");
}

function goLogin() {
  menuOpen.value = false;
  router.push("/");
}
</script>
