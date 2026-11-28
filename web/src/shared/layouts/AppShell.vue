<template>
  <div class="app-layout">
    <header class="app-header">
      <RouterLink to="/app/home" class="app-header-brand" aria-label="Ч-Банк">
        <AppLogo class="app-logo" lockup />
      </RouterLink>
      <button
        type="button"
        class="app-account-btn"
        :aria-label="t('Account, portfolio and add data')"
        :aria-expanded="navOpen"
        @click="navOpen = !navOpen"
      >
        {{ auth.isDemo ? "👤" : accountInitial || "👤" }}
      </button>
    </header>

    <Teleport to="body">
      <template v-if="navOpen">
        <div class="acct-backdrop" aria-hidden="true" @click="closeNav" />
        <nav class="acct" :aria-label="t('Account')">
          <header class="acct-head">
            <span class="acct-avatar" aria-hidden="true">{{ auth.isDemo ? "👤" : accountInitial || "👤" }}</span>
            <strong class="acct-who">{{ auth.isDemo ? t("Demo household") : auth.userLabel || t("Account") }}</strong>
            <button type="button" class="acct-close" :aria-label="t('Close')" @click="closeNav">×</button>
          </header>

          <div class="acct-group">
            <label class="acct-row">
              <svg class="acct-icon" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="3.25" fill="none" stroke="currentColor" stroke-width="1.5" />
                <path d="M8 1.5v1.25M8 13.25V14.5M14.5 8h-1.25M2.75 8H1.5M12.55 3.45l-.88.88M4.33 11.67l-.88.88M12.55 12.55l-.88-.88M4.33 4.33l-.88-.88" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" />
              </svg>
              <span class="acct-label">{{ t("Light mode") }}</span>
              <ToggleSwitch :model-value="app.lightMode" @update:model-value="onLightModeChange" />
            </label>
            <div class="acct-row acct-row--stack">
              <svg class="acct-icon" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 1.75a6.25 6.25 0 1 0 0 12.5c.9 0 1.4-.6 1.4-1.3 0-1-.9-1.2-.9-2.1 0-.8.6-1.4 1.5-1.4h1.5a2.25 2.25 0 0 0 2.25-2.25C13.75 4.1 11.2 1.75 8 1.75z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
                <circle cx="5" cy="7.5" r="0.9" fill="currentColor" /><circle cx="7.6" cy="4.9" r="0.9" fill="currentColor" /><circle cx="10.6" cy="5.6" r="0.9" fill="currentColor" />
              </svg>
              <span class="acct-label">{{ t("Palette") }}</span>
              <div class="pal-switch" role="radiogroup" :aria-label="t('Palette')">
                <button
                  v-for="p in PALETTE_OPTIONS"
                  :key="p.value"
                  type="button"
                  role="radio"
                  class="pal-dot"
                  :class="{ 'pal-dot--on': app.palette === p.value }"
                  :style="{ '--dot': p.color }"
                  :aria-checked="app.palette === p.value"
                  :aria-label="t(p.label)"
                  :title="t(p.label)"
                  @click="app.setPalette(p.value)"
                />
              </div>
            </div>
            <div v-if="LANGUAGE_READY" class="acct-row">
              <svg class="acct-icon" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.4" />
                <path d="M1.75 8h12.5M8 1.75c1.9 1.8 2.75 3.9 2.75 6.25S9.9 12.45 8 14.25C6.1 12.45 5.25 10.35 5.25 8S6.1 3.55 8 1.75z" fill="none" stroke="currentColor" stroke-width="1.3" />
              </svg>
              <span class="acct-label">{{ t("Language") }}</span>
              <div class="lang-switch" role="radiogroup" :aria-label="t('Language')">
                <button
                  v-for="opt in LANGS"
                  :key="opt.value"
                  type="button"
                  role="radio"
                  class="lang-switch-btn"
                  :class="{ 'lang-switch-btn--on': locale === opt.value }"
                  :aria-checked="locale === opt.value"
                  @click="setLocale(opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>
          </div>

          <div v-if="!auth.isDemo && auth.canEdit" class="acct-group">
            <input ref="uploadInput" type="file" accept=".xlsx" hidden @change="onUpload" />
            <button type="button" class="acct-row acct-row--btn" :disabled="processing" @click="uploadInput?.click()">
              <svg class="acct-icon" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 10.25V3.5M5.25 6.25 8 3.5l2.75 2.75" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M3.25 10.25v1.5a1.25 1.25 0 0 0 1.25 1.25h7a1.25 1.25 0 0 0 1.25-1.25v-1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="acct-label">{{ t("Import statement") }}</span>
              <span class="acct-chevron" aria-hidden="true">›</span>
            </button>
          </div>

          <div v-if="marketRows.length" class="acct-group acct-markets" role="group" :aria-label="t('Markets')">
            <div v-for="m in marketRows" :key="m.key" class="acct-tick">
              <span class="acct-tick-name">
                <strong>{{ m.label }}</strong>
                <small v-if="m.sub">{{ m.sub }}</small>
              </span>
              <span class="acct-tick-price">{{ m.price }}</span>
              <span v-if="m.change != null" class="acct-tick-change" :class="m.change >= 0 ? 'acct-tick-change--up' : 'acct-tick-change--down'">
                {{ m.change >= 0 ? "+" : "−" }}{{ Math.abs(m.change).toFixed(1) }}%
              </span>
              <span v-else class="acct-tick-change" aria-hidden="true">—</span>
            </div>
          </div>

          <div v-if="auth.isDemo" class="acct-group">
            <p class="acct-note">{{ t("Demo household — try anything: edits stay in this browser only.") }}</p>
            <button type="button" class="acct-row acct-row--btn" @click="onResetDemo">
              <span class="acct-label">{{ t("Reset demo") }}</span>
            </button>
            <button type="button" class="acct-row acct-row--btn acct-row--accent" @click="goLogin">
              <span class="acct-label">{{ t("Sign in") }}</span>
            </button>
          </div>

          <div v-if="auth.authRequired && auth.isAuthenticated" class="acct-group acct-group--bottom">
            <button type="button" class="acct-row acct-row--btn acct-row--danger" @click="logout">
              <svg class="acct-icon" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6.25 2.75h4.5a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M9.25 8H2.75M6.75 5.5 9.25 8l-2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="acct-label">{{ t("Sign out") }}</span>
            </button>
          </div>
        </nav>
      </template>
    </Teleport>

    <main class="main main--with-tabbar">
      <div
        class="ptr"
        :class="{ 'ptr--ready': pullDistance >= PULL_TRIGGER, 'ptr--busy': pullRefreshing, 'ptr--dragging': pullDistance > 0 }"
        :style="{ height: `${pullRefreshing ? PULL_TRIGGER : pullDistance}px` }"
        aria-hidden="true"
      >
        <AppLogo
          :key="pullRefreshing ? 'busy' : 'drag'"
          class="ptr-logo"
          :animated="pullRefreshing"
          :progress="pullRefreshing ? undefined : Math.min(pullDistance / PULL_TRIGGER, 1)"
        />
      </div>
      <RouterView :key="viewKey" />
    </main>
    <nav class="app-tabbar" :aria-label="t('Sections')">
      <RouterLink
        v-for="item in tabItems"
        :key="item.to"
        class="app-tab"
        :class="{ 'app-tab--active': isTabActive(item.to) }"
        :to="item.to"
        :aria-current="isTabActive(item.to) ? 'page' : undefined"
      >
        <svg class="app-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            :d="item.icon"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="app-tab-label">{{ t(item.label) }}</span>
        <span
          v-if="item === TRANSACTIONS_TAB && merchantsWaiting > 0"
          class="app-tab-badge"
          :aria-label="t('{n} {n|merchant needs|merchants need} a name', { n: merchantsWaiting })"
        >{{ merchantsWaiting > 9 ? "9+" : merchantsWaiting }}</span>
      </RouterLink>
    </nav>

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
          <button type="button" class="btn" @click="dismissProcessError">{{ t("Dismiss") }}</button>
          <button v-if="canRetry" type="button" class="btn btn-primary" @click="retryProcess">{{ t("Try again") }}</button>
        </div>
      </div>
    </div>

    <div v-if="uploadPromptFile" class="process-error-overlay" role="dialog" aria-modal="true">
      <div class="process-error-card upload-type-card">
        <h3>{{ t("Statement type") }}</h3>
        <p class="upload-type-file">{{ uploadPromptFile.name }}</p>
        <p class="upload-type-hint">
          {{ t("Exports around the 10th–13th are often still incomplete — pick Partial unless this file is the full official bill for the cycle. Final closes the month (pace tab, projections) — use only when nothing is missing. After you choose, processing continues in the background — you can keep using the app or leave.") }}
        </p>
        <div class="process-error-actions upload-type-actions">
          <button type="button" class="btn" @click="cancelUploadPrompt">{{ t("Cancel") }}</button>
          <button type="button" class="btn btn-primary" @click="confirmUpload('partial')">{{ t("Partial snapshot") }}</button>
          <button type="button" class="btn" @click="confirmUpload('final')">{{ t("Final — closes cycle") }}</button>
        </div>
      </div>
    </div>

    <AppToast />
    <Teleport to="body">
      <UploadJobToast
        v-if="uploadToast"
        :state="uploadToast.state"
        :message="uploadToast.message"
        :can-retry="Boolean(uploadRetry)"
        @dismiss="dismissUploadToast"
        @retry="retryUploadJob"
      />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { useAllReportStore } from "@/shared/stores/allReport";
import { whenSettled } from "@/shared/utils/whenSettled";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import AppLoader from "@/shared/components/AppLoader.vue";
import AppLogo from "@/shared/components/AppLogo.vue";
import ToggleSwitch from "@/shared/components/ToggleSwitch.vue";
import UploadJobToast from "@/shared/components/UploadJobToast.vue";
import AppToast from "@/shared/components/AppToast.vue";
import {
  fetchUploadJob,
  startUploadJob,
  fetchAppConfig,
  type UploadJobResponse,
} from "@/shared/api/client";
import { emitSpendingRefresh } from "@/features/spending/composables/useSpendingRefresh";
import { wakeAnalyzerInBrowser } from "@/shared/api/wakeAnalyzer";
import { invalidateAllDataCaches } from "@/shared/stores/invalidateCaches";
import { hasSavedPalette, useAppStore, type Palette } from "@/shared/stores/app";
import { useAuthStore } from "@/shared/stores/auth";
import { usePortfolioStore } from "@/shared/stores/portfolio";
import { useHouseholdDataStore } from "@/shared/stores/viewData";
import { usePayslipsDataStore } from "@/features/money/stores/payslipsData";
import { useHomeDataStore } from "@/features/home/stores/homeData";
import { useReviewDataStore } from "@/features/merchants/stores/reviewData";
import { goToSignIn } from "@/features/auth/utils/signIn";
import { clearUploadJobId, readUploadJobId, saveUploadJobId } from "@/shared/utils/uploadJobSession";
import { resetDemoAndReload } from "@/shared/demo/reset";
import { locale, setLocale, t, tr, type Locale } from "@/shared/i18n";

/** The switch shows once every screen is translated. */
const LANGUAGE_READY = true;
const PALETTE_OPTIONS: { value: Palette; label: string; color: string }[] = [
  { value: "gold", label: "Gold", color: "#ffcf3f" },
  { value: "emerald", label: "Emerald", color: "#2bd48a" },
  { value: "cobalt", label: "Cobalt", color: "#3d6bff" },
  { value: "carmine", label: "Carmine graphite", color: "#e5392e" },
  { value: "tiffany", label: "Tiffany", color: "#81d8d0" },
  { value: "powder", label: "Powder", color: "#f6a9c4" },
  { value: "peach", label: "Peach", color: "#ffb8a0" },
];

const LANGS: { value: Locale; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "ru", label: "RU" },
];

/** Bottom tab bar: the five screens used most, one thumb-tap away. Everything else stays in the menu. */
const HOME_TAB = { to: "/app/home", label: "Today", icon: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" };
const SPENDING_TAB = { to: "/app/overview", label: "Spending", icon: "M4 19V11M10 19V5M16 19v-6M22 19H2" };
const TRANSACTIONS_TAB = { to: "/app/browse", label: "Transactions", icon: "M4 6h16M4 12h16M4 18h10" };
const BUDGET_TAB = { to: "/app/household", label: "Budget", icon: "M4 7h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 7l2-3h12l2 3M15 13h2" };
const MONEY_TAB = { to: "/app/money", label: "Money", icon: "M4 17l5-5 4 4 7-8M15 8h5v5" };
// Labelling merchants lives inside Transactions (Merchants view); Today flags it.
const tabItems = computed(() => [HOME_TAB, SPENDING_TAB, TRANSACTIONS_TAB, BUDGET_TAB, MONEY_TAB]);

const reviewData = useReviewDataStore();
/** Red dot on Transactions while merchants are waiting for a name. */
const merchantsWaiting = computed(() => (auth.readOnly && !auth.isDemo ? 0 : reviewData.data?.queue.length ?? 0));

function isTabActive(to: string): boolean {
  return route.path === to || route.path.startsWith(`${to}/`);
}

const app = useAppStore();

function onLightModeChange(value: boolean) {
  if (value !== app.lightMode) app.toggleTheme();
}
const auth = useAuthStore();
const portfolio = usePortfolioStore();
const { kaspaQuote, marketSnapshot } = storeToRefs(portfolio);
const route = useRoute();
const router = useRouter();
const processing = ref(false);
const processTitle = ref("");
const processSubtitle = ref("");
const processSteps = ref<string[]>([]);
const processStep = ref(0);
const processError = ref("");
const processErrorTitle = ref(t("Something went wrong"));
const canRetry = ref(false);
const retryProcessFn = ref<(() => void) | null>(null);
const uploadInput = ref<HTMLInputElement | null>(null);
const uploadPromptFile = ref<File | null>(null);
const uploadToast = ref<{ state: "syncing" | "done" | "error"; message: string } | null>(null);
const uploadToastMuted = ref(false);
const uploadRetry = ref<{ file: File; statementType: "partial" | "final" } | null>(null);
const navOpen = ref(false);
let stepTimer: ReturnType<typeof setInterval> | null = null;
let uploadPollTimer: ReturnType<typeof setInterval> | null = null;
let uploadDoneTimer: ReturnType<typeof setTimeout> | null = null;
let activeUploadJobId: string | null = null;

const accountInitial = computed(() => {
  const label = auth.userLabel?.trim();
  return label ? label.charAt(0).toUpperCase() : "?";
});


/** Main tickers for the account panel; a row is left out when its price is missing. */
function tickerPrice(n: number): string {
  const decimals = n >= 1000 ? 0 : n >= 1 ? 2 : 4;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
const marketRows = computed(() => {
  const m = marketSnapshot.value;
  if (!m) return [];
  const c = m.change_pct ?? {};
  const rows: { key: string; label: string; sub?: string; value?: number; change?: number }[] = [
    { key: "btc", label: "BTC", value: m.btc_usd, change: c.btc },
    { key: "kas", label: "KAS", value: m.kas_usd ?? kaspaQuote.value?.price_usdt, change: c.kas },
    { key: "sp500", label: "S&P 500", value: m.sp500, change: c.sp500 },
    { key: "dog", label: "DOG", sub: "ProShares Short Dow30", value: m.dog_usd, change: c.dog },
  ];
  return rows
    .filter((r) => r.value != null && r.value > 0)
    .map((r) => ({
      key: r.key,
      label: r.label,
      sub: r.sub,
      price: r.key === "sp500" ? r.value!.toLocaleString("en-US", { maximumFractionDigits: 0 }) : tickerPrice(r.value!),
      change: r.change ?? null,
    }));
});

// Julia opens the app in the soft Tiffany palette until she picks her own.
watch(
  () => auth.userId,
  (id) => {
    if (id === "julia" && !hasSavedPalette()) app.setPalette("tiffany");
  },
  { immediate: true },
);

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

/** Quietly fetch what the Budget and Money tabs need while the first screen is being read, so they open with numbers in. */
function warmTabs() {
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  const quiet = () => undefined;
  void useHomeDataStore().load(demo, token).catch(quiet);
  void useHouseholdDataStore().load(demo, token).catch(quiet);
  if (!demo && auth.canEditBudget) void usePayslipsDataStore().load(demo, token).catch(quiet);
}

onMounted(() => {
  setTimeout(warmTabs, 600);
  portfolio.startPolling(auth.isDemo, auth.token || undefined);
  void resumeUploadJobIfNeeded();
});

onUnmounted(() => {
  clearStepTimer();
  stopUploadPolling();
  if (uploadDoneTimer) clearTimeout(uploadDoneTimer);
  portfolio.stopPolling();
  document.body.style.overflow = "";
});

function clearStepTimer() {
  if (stepTimer) {
    clearInterval(stepTimer);
    stepTimer = null;
  }
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

function stopUploadPolling() {
  if (uploadPollTimer) {
    clearInterval(uploadPollTimer);
    uploadPollTimer = null;
  }
  activeUploadJobId = null;
}

function dismissUploadToast() {
  if (uploadDoneTimer) {
    clearTimeout(uploadDoneTimer);
    uploadDoneTimer = null;
  }
  if (uploadToast.value?.state === "syncing" && activeUploadJobId) {
    uploadToastMuted.value = true;
    uploadToast.value = null;
    return;
  }
  uploadToast.value = null;
  uploadToastMuted.value = false;
  if (!activeUploadJobId) clearUploadJobId();
}

function showUploadToast(state: "syncing" | "done" | "error", message: string) {
  if (state === "syncing" && uploadToastMuted.value) {
    return;
  }
  if (state === "done" || state === "error") {
    uploadToastMuted.value = false;
  }
  uploadToast.value = { state, message };
}

function applyUploadJobStatus(job: UploadJobResponse) {
  if (job.status === "done") {
    stopUploadPolling();
    clearUploadJobId();
    uploadRetry.value = null;
    const detail = tr(job.message) || t("Statement saved");
    showUploadToast("done", detail);
    uploadDoneTimer = window.setTimeout(dismissUploadToast, 6000);
    emitSpendingRefresh();
    return;
  }
  if (job.status === "error") {
    stopUploadPolling();
    clearUploadJobId();
    showUploadToast("error", tr(job.error?.trim() || job.message) || t("Upload failed"));
    return;
  }
  showUploadToast("syncing", tr(job.message) || t("Processing statement…"));
}

async function pollUploadJob(jobId: string) {
  try {
    const job = await fetchUploadJob(jobId, auth.token || undefined);
    if (activeUploadJobId !== jobId) return;
    applyUploadJobStatus(job);
  } catch (e) {
    if (activeUploadJobId !== jobId) return;
    const message = e instanceof Error ? e.message : String(e);
    stopUploadPolling();
    clearUploadJobId();
    showUploadToast("error", message.trim() || t("Could not check upload status"));
  }
}

function watchUploadJob(jobId: string) {
  stopUploadPolling();
  activeUploadJobId = jobId;
  saveUploadJobId(jobId);
  void pollUploadJob(jobId);
  uploadPollTimer = setInterval(() => {
    void pollUploadJob(jobId);
  }, 1500);
}

async function resumeUploadJobIfNeeded() {
  if (auth.isDemo) return;
  const jobId = readUploadJobId();
  if (!jobId || activeUploadJobId) return;
  showUploadToast("syncing", t("Checking upload…"));
  watchUploadJob(jobId);
}

/**
 * Render's free tier wakes a sleeping service for outside traffic, but often not for the
 * API's server-to-server pings. Nudge the analyzer from this browser while the server waits
 * for it; failures are ignored because the server-side wake still runs.
 */
async function wakeAnalyzerFromHere() {
  if (auth.isDemo) return;
  try {
    const config = await fetchAppConfig(auth.token || undefined);
    if (config.analyzer_wake_from_browser && config.analyzer_wake_url) {
      await wakeAnalyzerInBrowser(config.analyzer_wake_url);
    }
  } catch {
    /* the server keeps trying on its own */
  }
}

/* ── Pull to refresh: drag down at the top of any screen to reload it from the server. ── */
const PULL_TRIGGER = 64;
const PULL_DEADZONE = 14;
const pullDistance = ref(0);
const pullRefreshing = ref(false);
const viewKey = ref(0);
let pullStartY: number | null = null;
let pullStartX = 0;

function pullBlocked(): boolean {
  // Not while a sheet, dialog or the account panel is open, and only at the very top.
  return navOpen.value || window.scrollY > 0 || document.body.style.overflow === "hidden";
}

function onPullStart(e: TouchEvent) {
  if (pullRefreshing.value || e.touches.length !== 1 || pullBlocked()) {
    pullStartY = null;
    return;
  }
  // A touch that starts on the tab bar or the header is a tap on a button, never a pull.
  if ((e.target as Element | null)?.closest?.(".app-tabbar, .app-header")) {
    pullStartY = null;
    return;
  }
  pullStartY = e.touches[0].clientY;
  pullStartX = e.touches[0].clientX;
}

function onPullMove(e: TouchEvent) {
  if (pullStartY == null) return;
  const dy = e.touches[0].clientY - pullStartY;
  const dx = Math.abs(e.touches[0].clientX - pullStartX);
  if (window.scrollY > 0 || dx > dy) {
    pullDistance.value = 0;
    return;
  }
  // A tap always drifts a few pixels. Below the dead zone this is still a tap: do not cancel the touch,
  // or iOS drops the click and the button "gets stuck".
  if (dy <= PULL_DEADZONE) {
    pullDistance.value = 0;
    return;
  }
  // Resistance: the indicator follows at half speed and stops at 1.5× the trigger.
  pullDistance.value = Math.min((dy - PULL_DEADZONE) * 0.5, PULL_TRIGGER * 1.5);
  if (e.cancelable) e.preventDefault();
}

async function onPullEnd() {
  if (pullStartY == null) return;
  pullStartY = null;
  const trigger = pullDistance.value >= PULL_TRIGGER;
  pullDistance.value = 0;
  if (!trigger) return;
  pullRefreshing.value = true;
  try {
    invalidateAllDataCaches();
    void portfolio.refresh(auth.isDemo, auth.token || undefined, true);
    viewKey.value += 1; // remount the screen so it loads fresh data
    await whenSettled(1700, 8000); // the logo is drawn, and stays until the screen has its data
  } finally {
    pullRefreshing.value = false;
  }
}

onMounted(() => {
  // Warm the "all charges" data quietly after the first screen is up, so Transactions and
  // All merchants open instantly. Any failure is ignored — those screens load it themselves.
  setTimeout(() => {
    if (!auth.token && !auth.isDemo) return;
    void useAllReportStore().load(auth.isDemo, auth.token || undefined).catch(() => undefined);
  }, 2500);
  window.addEventListener("touchstart", onPullStart, { passive: true });
  window.addEventListener("touchmove", onPullMove, { passive: false });
  window.addEventListener("touchend", onPullEnd, { passive: true });
  window.addEventListener("touchcancel", onPullEnd, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener("touchstart", onPullStart);
  window.removeEventListener("touchmove", onPullMove);
  window.removeEventListener("touchend", onPullEnd);
  window.removeEventListener("touchcancel", onPullEnd);
});

async function runUpload(file: File, statementType: "partial" | "final") {
  void wakeAnalyzerFromHere();
  uploadRetry.value = { file, statementType };
  uploadToastMuted.value = false;
  showUploadToast(
    "syncing",
    statementType === "partial"
      ? t("Sending {name} (partial)…", { name: file.name })
      : t("Sending {name}…", { name: file.name }),
  );
  try {
    const job = await startUploadJob(file, statementType, auth.token || undefined);
    applyUploadJobStatus(job);
    if (job.status !== "done" && job.status !== "error") {
      watchUploadJob(job.jobId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    showUploadToast("error", message);
  }
}

function retryUploadJob() {
  const pending = uploadRetry.value;
  dismissUploadToast();
  if (!pending) return;
  void runUpload(pending.file, pending.statementType);
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

function onResetDemo() {
  closeNav();
  void resetDemoAndReload();
}

function goLogin() {
  closeNav();
  void goToSignIn(router);
}
</script>
