<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="app-header-brand">
        <div class="app-portfolio-switch">
          <div class="app-portfolio-tabs" role="tablist" aria-label="Portfolio asset">
            <button
              type="button"
              class="app-portfolio-tab"
              :class="{ 'app-portfolio-tab--active': portfolioAsset === 'kas' }"
              role="tab"
              :aria-selected="portfolioAsset === 'kas'"
              aria-label="Kaspa"
              @click="setPortfolioAsset('kas')"
            >
              <img class="app-portfolio-tab-logo" :src="kaspaLogo" alt="" width="18" height="18" />
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
          <span class="app-kaspa-item">{{ portfolioPriceLabel }}</span>
          <span class="app-kaspa-sep" aria-hidden="true">·</span>
          <span class="app-kaspa-item app-kaspa-portfolio">{{ portfolioValueLabel }}</span>
        </div>
      </div>
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
        <div class="mobile-nav-backdrop" aria-hidden="true" @click="closeNav" />
        <nav class="mobile-nav-drawer" aria-label="Main navigation">
          <div class="mobile-nav-drawer-head">
            <span class="mobile-nav-drawer-title">{{ t("Account") }}</span>
            <button type="button" class="btn btn-icon mobile-nav-close" :aria-label="t('Close')" @click="closeNav">
              ×
            </button>
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
                <span class="mobile-nav-portfolio-label">{{ t("Total") }}</span>
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
              <label class="mobile-nav-setting-row">
                <span class="mobile-nav-setting-icon" aria-hidden="true">
                  <svg class="mobile-nav-action-icon" viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="3.25" fill="none" stroke="currentColor" stroke-width="1.5" />
                    <path
                      d="M8 1.5v1.25M8 13.25V14.5M14.5 8h-1.25M2.75 8H1.5M12.55 3.45l-.88.88M4.33 11.67l-.88.88M12.55 12.55l-.88-.88M4.33 4.33l-.88-.88"
                      stroke="currentColor"
                      stroke-width="1.35"
                      stroke-linecap="round"
                    />
                  </svg>
                </span>
                <span class="mobile-nav-setting-copy">
                  <span class="mobile-nav-setting-label">{{ t("Light mode") }}</span>
                  <span class="mobile-nav-setting-hint">{{ app.lightMode ? t("On") : t("Off") }}</span>
                </span>
                <ToggleSwitch :model-value="app.lightMode" @update:model-value="onLightModeChange" />
              </label>

              <div v-if="LANGUAGE_READY" class="mobile-nav-setting-row">
                <span class="mobile-nav-setting-icon" aria-hidden="true">
                  <svg class="mobile-nav-action-icon" viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.4" />
                    <path d="M1.75 8h12.5M8 1.75c1.9 1.8 2.75 3.9 2.75 6.25S9.9 12.45 8 14.25C6.1 12.45 5.25 10.35 5.25 8S6.1 3.55 8 1.75z" fill="none" stroke="currentColor" stroke-width="1.3" />
                  </svg>
                </span>
                <span class="mobile-nav-setting-copy">
                  <span class="mobile-nav-setting-label">{{ t("Language") }}</span>
                  <span class="mobile-nav-setting-hint">{{ locale === "ru" ? "Русский" : "English" }}</span>
                </span>
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

              <div v-if="auth.isDemo" class="mobile-nav-account-card">
                <p class="mobile-nav-demo-note">{{ t("Demo household — try anything: edits stay in this browser only.") }}</p>
                <button type="button" class="mobile-nav-action btn" @click="onResetDemo">
                  {{ t("Reset demo") }}
                </button>
                <button type="button" class="mobile-nav-action btn mobile-nav-action--accent" @click="goLogin">
                  {{ t("Sign in") }}
                </button>
              </div>

              <div v-else class="mobile-nav-account-card">
                <div v-if="auth.userLabel" class="mobile-nav-account-header">
                  <span class="mobile-nav-account-avatar" aria-hidden="true">{{ accountInitial }}</span>
                  <div class="mobile-nav-account-meta">
                    <span class="mobile-nav-account-eyebrow">{{ t("Signed in as") }}</span>
                    <span class="mobile-nav-account-name">{{ auth.userLabel }}</span>
                  </div>
                </div>

                <input ref="uploadInput" type="file" accept=".xlsx" hidden @change="onUpload" />
                <button
                  v-if="auth.isDemo || auth.canEdit"
                  type="button"
                  class="mobile-nav-action btn"
                  :disabled="processing"
                  @click="uploadInput?.click()"
                >
                  <svg class="mobile-nav-action-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M8 10.25V3.5M5.25 6.25 8 3.5l2.75 2.75"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M3.25 10.25v1.5a1.25 1.25 0 0 0 1.25 1.25h7a1.25 1.25 0 0 0 1.25-1.25v-1.5"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  {{ t("Import statement") }}
                </button>

                <button
                  v-if="auth.canEdit && !auth.isDemo"
                  type="button"
                  class="mobile-nav-action btn"
                  :disabled="calBusy"
                  @click="syncCal()"
                >
                  {{ t("Sync Cal") }}
                </button>

                <button
                  v-if="showLocalSync && (auth.isDemo || auth.canEdit)"
                  type="button"
                  class="mobile-nav-action btn"
                  :disabled="processing"
                  @click="sync"
                >
                  <svg class="mobile-nav-action-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M13.25 2.75v3.5H9.75M2.75 13.25v-3.5h3.5"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M3.15 6.5A4.75 4.75 0 0 1 12.1 4.5M12.85 9.5A4.75 4.75 0 0 1 3.9 11.5"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  {{ t("Sync .xlsx files") }}
                </button>

                <button
                  v-if="auth.authRequired && auth.isAuthenticated"
                  type="button"
                  class="mobile-nav-action btn mobile-nav-action--danger"
                  @click="logout"
                >
                  <svg class="mobile-nav-action-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M6.25 2.75h4.5a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-4.5"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M9.25 8H2.75M6.75 5.5 9.25 8l-2.5 2.5"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  {{ t("Sign out") }}
                </button>
              </div>
            </div>
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
        <span class="ptr-icon" :style="{ transform: `rotate(${pullRefreshing ? 0 : pullDistance * 3}deg)` }">↻</span>
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
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import AppLoader from "@/shared/components/AppLoader.vue";
import ToggleSwitch from "@/shared/components/ToggleSwitch.vue";
import UploadJobToast from "@/shared/components/UploadJobToast.vue";
import AppToast from "@/shared/components/AppToast.vue";
import {
  fetchCalSyncJob,
  fetchUploadJob,
  startCalSync,
  startUploadJob,
  fetchAppConfig,
  syncStatements,
  type CalSyncJob,
  type UploadJobResponse,
} from "@/shared/api/client";
import { clearCalSyncJobId, readCalSyncJobId, saveCalSyncJobId } from "@/shared/utils/calSyncSession";
import { emitSpendingRefresh } from "@/features/spending/composables/useSpendingRefresh";
import { wakeAnalyzerInBrowser } from "@/shared/api/wakeAnalyzer";
import { invalidateAllDataCaches } from "@/shared/stores/invalidateCaches";
import { useAppStore } from "@/shared/stores/app";
import { useAuthStore } from "@/shared/stores/auth";
import { usePortfolioStore } from "@/shared/stores/portfolio";
import { useReviewDataStore } from "@/features/merchants/stores/reviewData";
import { goToSignIn } from "@/features/auth/utils/signIn";
import { clearUploadJobId, readUploadJobId, saveUploadJobId } from "@/shared/utils/uploadJobSession";
import { formatFxcnNavPrice, formatIls, formatKasUsdtPrice, formatRub, formatSp500, formatUsd, formatUsdt } from "@/shared/utils/format";
import kaspaLogo from "@/assets/kaspa.png";
import { resetDemoAndReload } from "@/shared/demo/reset";
import { locale, setLocale, t, tr, type Locale } from "@/shared/i18n";

/** The switch shows once every screen is translated. */
const LANGUAGE_READY = true;
const LANGS: { value: Locale; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "ru", label: "RU" },
];

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

const SYNC_STEPS = [
  "Scanning statements folder",
  "Reading spreadsheets",
  "Analysing expenses",
  "Applying merchant rules",
  "Saving updates",
];



/** Bottom tab bar: the four screens used most, one thumb-tap away. Everything else stays in the menu. */
const HOME_TAB = { to: "/app/home", label: "Today", icon: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" };
const SPENDING_TAB = { to: "/app/overview", label: "Spending", icon: "M4 19V11M10 19V5M16 19v-6M22 19H2" };
const TRANSACTIONS_TAB = { to: "/app/browse", label: "Transactions", icon: "M4 6h16M4 12h16M4 18h10" };
const BUDGET_TAB = { to: "/app/household", label: "Budget", icon: "M4 7h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 7l2-3h12l2 3M15 13h2" };
// Labelling merchants lives inside Transactions (Merchants view); Today flags it.
const tabItems = computed(() => [HOME_TAB, SPENDING_TAB, TRANSACTIONS_TAB, BUDGET_TAB]);

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
const { kaspaQuote, fxcnQuote, marketSnapshot, refreshing: portfolioRefreshing } = storeToRefs(portfolio);
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
const portfolioAsset = ref<PortfolioAsset>(readPortfolioAsset());
let stepTimer: ReturnType<typeof setInterval> | null = null;
let uploadPollTimer: ReturnType<typeof setInterval> | null = null;
let uploadDoneTimer: ReturnType<typeof setTimeout> | null = null;
let activeUploadJobId: string | null = null;
const calBusy = ref(false);
let calPollTimer: ReturnType<typeof setInterval> | null = null;
let activeCalJobId: string | null = null;

const accountInitial = computed(() => {
  const label = auth.userLabel?.trim();
  return label ? label.charAt(0).toUpperCase() : "?";
});

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
  return `${t("Combined portfolio")} · ${parts.join(" · ")}`;
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
  portfolioAsset.value === "kas" ? t("Refresh KAS price") : t("Refresh FXCN NAV"),
);

const kasPortfolioTitle = computed(() => {
  if (!kaspaQuote.value) return "";
  const { price_usdt, balance_kas, portfolio_usdt, source, stale } = kaspaQuote.value;
  const staleNote = stale ? ` · ${t("cached")}` : "";
  return `Kaspa ${formatKasUsdtPrice(price_usdt)} · ${balance_kas.toLocaleString("en-US", { maximumFractionDigits: 3 })} KAS · ${formatUsdt(portfolio_usdt)} · ${source}${staleNote}`;
});

const fxcnPortfolioTitle = computed(() => {
  if (!fxcnQuote.value) return "";
  const { nav_usd, lots, portfolio_usd, source, stale } = fxcnQuote.value;
  const staleNote = stale ? ` · ${t("cached")}` : "";
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

async function refreshPortfolioQuote(force = false) {
  if (portfolioRefreshing.value) return;
  await portfolio.refresh(auth.isDemo, auth.token || undefined, force);
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
  portfolio.startPolling(auth.isDemo, auth.token || undefined);
  void resumeUploadJobIfNeeded();
  void resumeCalSyncIfNeeded();
});

onUnmounted(() => {
  clearStepTimer();
  stopUploadPolling();
  stopCalPolling();
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
  pullStartY = e.touches[0].clientY;
  pullStartX = e.touches[0].clientX;
}

function onPullMove(e: TouchEvent) {
  if (pullStartY == null) return;
  const dy = e.touches[0].clientY - pullStartY;
  const dx = Math.abs(e.touches[0].clientX - pullStartX);
  if (dy <= 0 || dx > dy || window.scrollY > 0) {
    pullDistance.value = 0;
    return;
  }
  // Resistance: the indicator follows at half speed and stops at 1.5× the trigger.
  pullDistance.value = Math.min(dy * 0.5, PULL_TRIGGER * 1.5);
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
    await new Promise((r) => setTimeout(r, 700));
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

function stopCalPolling() {
  if (calPollTimer) {
    clearInterval(calPollTimer);
    calPollTimer = null;
  }
}

function applyCalJobStatus(job: CalSyncJob) {
  if (job.status === "done") {
    stopCalPolling();
    clearCalSyncJobId();
    activeCalJobId = null;
    calBusy.value = false;
    showUploadToast("done", tr(job.message) || t("Statement saved"));
    uploadDoneTimer = window.setTimeout(dismissUploadToast, 6000);
    emitSpendingRefresh();
    return;
  }
  if (job.status === "error") {
    stopCalPolling();
    clearCalSyncJobId();
    activeCalJobId = null;
    calBusy.value = false;
    showUploadToast("error", tr(job.error?.trim() || job.message) || t("Cal sync failed"));
    return;
  }
  showUploadToast("syncing", tr(job.message) || t("Syncing Cal…"));
}

async function pollCalJob(jobId: string) {
  try {
    const job = await fetchCalSyncJob(jobId, auth.token || undefined);
    if (activeCalJobId !== jobId) return;
    applyCalJobStatus(job);
  } catch (e) {
    if (activeCalJobId !== jobId) return;
    stopCalPolling();
    clearCalSyncJobId();
    activeCalJobId = null;
    calBusy.value = false;
    const message = e instanceof Error ? e.message : String(e);
    showUploadToast("error", message.trim() || t("Could not check Cal sync"));
  }
}

function watchCalJob(jobId: string) {
  stopCalPolling();
  activeCalJobId = jobId;
  calBusy.value = true;
  saveCalSyncJobId(jobId);
  void pollCalJob(jobId);
  calPollTimer = setInterval(() => {
    void pollCalJob(jobId);
  }, 2000);
}

async function resumeCalSyncIfNeeded() {
  if (auth.isDemo || !auth.canEdit) return;
  const jobId = readCalSyncJobId();
  if (!jobId || activeCalJobId) return;
  showUploadToast("syncing", t("Checking Cal sync…"));
  watchCalJob(jobId);
}

async function syncCal() {
  closeNav();
  void wakeAnalyzerFromHere();
  calBusy.value = true;
  uploadToastMuted.value = false;
  showUploadToast("syncing", t("Starting Cal sync…"));
  try {
    const job = await startCalSync(auth.token || undefined);
    applyCalJobStatus(job);
    if (job.status !== "done" && job.status !== "error") watchCalJob(job.jobId);
  } catch (err) {
    calBusy.value = false;
    const message = err instanceof Error ? err.message : String(err);
    showUploadToast("error", message.trim() || t("Cal sync failed"));
  }
}

async function sync() {
  closeNav();
  beginProcess(t("Syncing statements"), t("Reading files from your statements folder"), SYNC_STEPS.map((s) => t(s)));
  try {
    startStepTimer(SYNC_STEPS.length - 2);
    await syncStatements(auth.token || undefined);
    clearStepTimer();
    processStep.value = SYNC_STEPS.length - 1;
    processSubtitle.value = t("Done — refreshing your data…");
    await new Promise((r) => setTimeout(r, 500));
    processing.value = false;
    emitSpendingRefresh();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failProcess(t("Sync failed"), message, sync);
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

function onResetDemo() {
  closeNav();
  void resetDemoAndReload();
}

function goLogin() {
  closeNav();
  void goToSignIn(router);
}
</script>
