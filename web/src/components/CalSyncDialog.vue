<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  fetchCalJobStatus,
  fetchCalStatus,
  finishCalSync,
  saveCalCredentials,
  startCalSync,
  submitCalOtp,
} from "../api/client";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  done: [];
  error: [message: string];
}>();

const step = ref<"credentials" | "otp" | "loading">("loading");
const nationalId = ref("");
const cardLast4 = ref("");
const otpCode = ref("");
const jobId = ref<string | null>(null);
const maskedId = ref<string | null>(null);
const statusError = ref("");
const submitting = ref(false);
const progressMessage = ref("");
const progressLogs = ref<{ at: string; message: string }[]>([]);

let pollTimer: ReturnType<typeof setInterval> | null = null;

const canSaveCredentials = computed(
  () => nationalId.value.trim().length >= 5 && cardLast4.value.replace(/\D/g, "").length === 4,
);

const canSubmitOtp = computed(() => otpCode.value.replace(/\D/g, "").length >= 4);

const recentLogs = computed(() => progressLogs.value.slice(-6));

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function applyJobStatus(status: {
  status: string;
  message: string | null;
  error: string | null;
  logs: { at: string; message: string }[];
}) {
  if (status.message) progressMessage.value = status.message;
  if (status.logs.length) progressLogs.value = status.logs;

  if (status.status === "otp_required") {
    step.value = "otp";
    submitting.value = false;
    stopPolling();
    return;
  }
  if (status.status === "done") {
    stopPolling();
    void finalizeSync();
    return;
  }
  if (status.status === "error") {
    stopPolling();
    submitting.value = false;
    statusError.value = status.error || "Cal sync failed";
    step.value = "otp";
    emit("error", statusError.value);
  }
}

async function finalizeSync() {
  if (!jobId.value) return;
  try {
    await finishCalSync(jobId.value, auth.token || undefined);
    emit("done");
  } catch (e) {
    statusError.value = e instanceof Error ? e.message : String(e);
    step.value = "otp";
    emit("error", statusError.value);
  } finally {
    submitting.value = false;
  }
}

function startPolling(id: string) {
  stopPolling();
  pollTimer = setInterval(() => {
    void (async () => {
      try {
        const status = await fetchCalJobStatus(id, auth.token || undefined);
        applyJobStatus(status);
      } catch (e) {
        stopPolling();
        submitting.value = false;
        statusError.value = e instanceof Error ? e.message : String(e);
      }
    })();
  }, 1000);
}

async function loadStatus() {
  stopPolling();
  statusError.value = "";
  progressMessage.value = "";
  progressLogs.value = [];
  step.value = "loading";
  try {
    const status = await fetchCalStatus(auth.token || undefined);
    if (!status.enabled) {
      statusError.value = "Cal sync is not enabled on the server.";
      return;
    }
    maskedId.value = status.national_id_masked;
    if (status.configured) {
      await beginSync();
    } else {
      step.value = "credentials";
    }
  } catch (e) {
    statusError.value = e instanceof Error ? e.message : String(e);
  }
}

async function saveCredentials() {
  submitting.value = true;
  statusError.value = "";
  try {
    await saveCalCredentials(
      nationalId.value.trim(),
      cardLast4.value.replace(/\D/g, ""),
      auth.token || undefined,
    );
    await beginSync();
  } catch (e) {
    statusError.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}

async function beginSync() {
  stopPolling();
  submitting.value = true;
  statusError.value = "";
  otpCode.value = "";
  jobId.value = null;
  progressMessage.value = "Starting Cal sync…";
  progressLogs.value = [];
  step.value = "loading";
  try {
    const result = await startCalSync(auth.token || undefined);
    jobId.value = result.jobId;
    startPolling(result.jobId);
    const initial = await fetchCalJobStatus(result.jobId, auth.token || undefined);
    applyJobStatus(initial);
  } catch (e) {
    submitting.value = false;
    statusError.value = e instanceof Error ? e.message : String(e);
    step.value = "otp";
    emit("error", statusError.value);
  }
}

async function submitOtp() {
  if (!jobId.value) return;
  submitting.value = true;
  statusError.value = "";
  progressMessage.value = "Verifying SMS code…";
  try {
    await submitCalOtp(jobId.value, otpCode.value.replace(/\D/g, ""), auth.token || undefined);
    emit("done");
  } catch (e) {
    statusError.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}

function close() {
  stopPolling();
  emit("close");
}

watch(
  () => props.open,
  (open) => {
    if (open) void loadStatus();
    else stopPolling();
  },
  { immediate: true },
);

onBeforeUnmount(stopPolling);
</script>

<template>
  <div v-if="open" class="process-error-overlay" role="dialog" aria-modal="true">
    <div class="process-error-card upload-type-card">
      <h3>Sync with Cal</h3>

      <template v-if="step === 'loading'">
        <p class="upload-type-hint">{{ progressMessage || "Connecting to Cal…" }}</p>
        <ul v-if="recentLogs.length" class="cal-sync-log" aria-live="polite">
          <li v-for="(entry, i) in recentLogs" :key="`${entry.at}-${i}`">
            {{ entry.message }}
          </li>
        </ul>
      </template>

      <template v-else-if="step === 'credentials'">
        <p class="upload-type-hint">
          Enter your Cal login details once. They are stored securely on the server (not in the app).
        </p>
        <label class="cal-field">
          <span>Teudat zehut</span>
          <input v-model="nationalId" type="text" inputmode="numeric" autocomplete="off" />
        </label>
        <label class="cal-field">
          <span>Last 4 digits of card</span>
          <input v-model="cardLast4" type="text" inputmode="numeric" maxlength="4" autocomplete="off" />
        </label>
        <div class="process-error-actions upload-type-actions">
          <button type="button" class="btn" @click="close">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!canSaveCredentials || submitting"
            @click="saveCredentials"
          >
            Save &amp; sync
          </button>
        </div>
      </template>

      <template v-else-if="step === 'otp'">
        <p class="upload-type-hint">
          <template v-if="maskedId">Account {{ maskedId }} — </template>
          Enter the SMS code from Cal.
        </p>
        <p v-if="progressMessage && submitting" class="cal-sync-progress">{{ progressMessage }}</p>
        <label class="cal-field">
          <span>SMS code</span>
          <input
            v-model="otpCode"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="8"
            placeholder="123456"
          />
        </label>
        <div class="process-error-actions upload-type-actions">
          <button type="button" class="btn" :disabled="submitting" @click="close">Cancel</button>
          <button
            v-if="!jobId"
            type="button"
            class="btn"
            :disabled="submitting"
            @click="beginSync"
          >
            Retry connect
          </button>
          <button
            v-else
            type="button"
            class="btn btn-primary"
            :disabled="!canSubmitOtp || submitting"
            @click="submitOtp"
          >
            Submit code
          </button>
        </div>
      </template>

      <p v-if="statusError" class="cal-sync-error" role="alert">{{ statusError }}</p>
    </div>
  </div>
</template>

<style scoped>
.cal-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0.75rem 0;
  font-size: 0.9rem;
}

.cal-field input {
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border, #ccc);
  background: var(--surface, #fff);
  color: inherit;
  /* iOS Safari zooms focused inputs below 16px — keep modal stable on iPhone/PWA */
  font-size: 16px;
  min-height: 44px;
}

.cal-sync-error {
  margin-top: 0.75rem;
  color: var(--danger, #c0392b);
  font-size: 0.9rem;
}

.cal-sync-progress {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  opacity: 0.85;
}

.cal-sync-log {
  margin: 0.75rem 0 0;
  padding-left: 1.1rem;
  font-size: 0.8rem;
  opacity: 0.75;
  max-height: 8rem;
  overflow-y: auto;
}

.cal-sync-log li {
  margin: 0.15rem 0;
}
</style>
