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
        <h1 class="app-title">Finance</h1>
        <p v-if="kaspaQuote" class="app-kaspa-strip" :class="{ 'app-kaspa-strip--stale': kaspaQuote.stale }" :title="kaspaTitle">
          <img class="app-kaspa-logo" :src="kaspaLogo" alt="" width="18" height="18" />
          <span class="app-kaspa-item">{{ formatKasUsdtPrice(kaspaQuote.price_usdt) }}</span>
          <span class="app-kaspa-sep" aria-hidden="true">·</span>
          <span class="app-kaspa-item app-kaspa-portfolio">{{ formatUsdt(kaspaQuote.portfolio_usdt, 0) }}</span>
        </p>
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
import { fetchAppConfig, fetchKaspaQuote, syncStatements, uploadStatement, warmAnalyzerService } from "../api/client";
import type { KaspaQuote } from "../api/client";
import { wakeAnalyzerInBrowser } from "../api/wakeAnalyzer";
import { useAppStore } from "../stores/app";
import { useAuthStore } from "../stores/auth";
import { formatKasUsdtPrice, formatUsdt } from "../utils/format";
import kaspaLogo from "../assets/kaspa.png";

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
let stepTimer: ReturnType<typeof setInterval> | null = null;
let kaspaTimer: ReturnType<typeof setInterval> | null = null;

const kaspaTitle = computed(() => {
  if (!kaspaQuote.value) return "";
  const { price_usdt, balance_kas, portfolio_usdt } = kaspaQuote.value;
  return `Kaspa ${formatKasUsdtPrice(price_usdt)} · ${balance_kas.toLocaleString("en-US", { maximumFractionDigits: 3 })} KAS · ${formatUsdt(portfolio_usdt)} portfolio`;
});

async function refreshKaspaQuote() {
  try {
    kaspaQuote.value = await fetchKaspaQuote(auth.isDemo, auth.token || undefined);
  } catch {
    /* keep last quote or hide until first success */
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
  kaspaTimer = setInterval(() => void refreshKaspaQuote(), 600_000);
});

onUnmounted(() => {
  clearStepTimer();
  if (kaspaTimer) {
    clearInterval(kaspaTimer);
    kaspaTimer = null;
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
