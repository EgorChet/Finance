<template>
  <div class="app-layout">
    <header class="app-header">
      <h1 class="app-title">Finance</h1>
      <nav class="app-nav">
        <RouterLink class="nav-tab" to="/app/overview">Overview</RouterLink>
        <RouterLink class="nav-tab" to="/app/mappings">Mappings</RouterLink>
        <RouterLink class="nav-tab" to="/app/review">Review</RouterLink>
        <RouterLink class="nav-tab" to="/app/excluded">Excluded</RouterLink>
        <RouterLink class="nav-tab" to="/app/recurring">Recurring</RouterLink>
      </nav>
      <div class="app-header-actions">
        <button type="button" class="btn btn-icon" aria-label="Menu" @click="menuOpen = !menuOpen">⋯</button>
        <div v-if="menuOpen" class="app-menu-backdrop" @click="menuOpen = false" />
        <div v-if="menuOpen" class="app-menu">
          <label class="app-menu-item">
            <input type="checkbox" :checked="app.lightMode" @change="app.toggleTheme()" />
            Light mode
          </label>
          <label class="app-menu-item">
            <input type="checkbox" :checked="app.expertMode" @change="app.toggleExpertMode()" />
            Expert mode
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
import { computed, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppLoader from "../components/AppLoader.vue";
import { syncStatements, uploadStatement } from "../api/client";
import { useAppStore } from "../stores/app";
import { useAuthStore } from "../stores/auth";

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

const app = useAppStore();
const auth = useAuthStore();
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
let stepTimer: ReturnType<typeof setInterval> | null = null;

const showLocalSync = computed(() => !import.meta.env.VITE_API_URL);

onUnmounted(() => {
  clearStepTimer();
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
