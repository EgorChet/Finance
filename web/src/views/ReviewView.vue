<template>
  <div>
    <div v-if="auth.isDemo" class="demo-banner">Demo review — sample queue only.</div>
    <h2 style="margin: 0 0 1rem">Review merchants</h2>
    <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; font-size: 0.9rem">
      <label><input v-model="onePerMerchant" type="checkbox" /> One card per place</label>
      <label><input v-model="includeLabeled" type="checkbox" /> Include labeled</label>
      <label><input v-model="includeReviewed" type="checkbox" /> Include reviewed</label>
      <button class="btn" @click="load">Refresh</button>
      <button v-if="!auth.isDemo" class="btn" @click="reset">Reset progress</button>
    </div>
    <p style="color: var(--text-muted)">
      {{ reviewedCount }} reviewed · {{ queue.length }} in queue
      <span v-if="index > 0"> · card {{ index + 1 }}</span>
    </p>
    <div v-if="loading" style="color: var(--text-muted); margin-top: 2rem; text-align: center">
      Loading queue…
    </div>
    <div v-else-if="queue.length === 0" style="color: var(--text-muted); margin-top: 2rem; text-align: center">
      Queue empty — all merchants have saved labels.
    </div>
    <div v-else-if="!current" style="color: var(--text-muted); margin-top: 2rem; text-align: center">
      End of queue.
      <button class="btn" style="margin-top: 0.75rem" @click="index = 0">Start over</button>
    </div>
    <div v-else class="review-card">
      <div style="font-size: 1.5rem; font-weight: 700">{{ formatIls(current.transaction.charge_amount) }}</div>
      <div style="color: var(--text-muted); margin: 0.25rem 0 0.5rem">
        {{ formatTransactionDate(current.transaction.date) }}
        <span v-if="current.transaction.billing_month"> · {{ current.transaction.billing_month }}</span>
      </div>
      <div style="margin: 0 0 1rem">
        {{ current.transaction.merchant_he }}
        <span v-if="current.occurrence_count > 1" style="color: var(--text-muted)">
          · {{ current.occurrence_count }} charges
        </span>
      </div>
      <label>
        English name
        <span v-if="suggesting" style="font-weight: 400; color: var(--text-muted)">(translating…)</span>
        <span v-else-if="englishSuggestion" style="font-weight: 400; color: var(--text-muted)">(suggested)</span>
      </label>
      <input v-model="english" class="input" :placeholder="englishSuggestion || 'English name'" />
      <label style="display: block; margin-top: 0.75rem">Category</label>
      <input v-model="category" class="input" list="cats" />
      <datalist id="cats">
        <option v-for="c in categories" :key="c" :value="c" />
      </datalist>
      <div style="display: flex; gap: 0.5rem; margin-top: 1.25rem">
        <button class="btn" @click="skip">Skip</button>
        <button class="btn btn-primary" :disabled="suggesting || confirming" @click="confirm">
          {{ confirming ? "Saving…" : "Confirm & next" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  confirmReview,
  fetchReviewQueue,
  fetchReviewSuggestion,
  resetReviewProgress,
} from "../api/client";
import { useAuthStore } from "../stores/auth";
import type { ReviewQueueItem } from "../types";
import { SPENDING_CATEGORIES } from "../categories";
import { formatIls, formatTransactionDate } from "../utils/format";

const auth = useAuthStore();
const queue = ref<ReviewQueueItem[]>([]);
const reviewedCount = ref(0);
const loading = ref(false);
const suggesting = ref(false);
const confirming = ref(false);
const index = ref(0);
const english = ref("");
const category = ref("");
const englishSuggestion = ref("");
const onePerMerchant = ref(true);
const includeLabeled = ref(false);
const includeReviewed = ref(false);

const suggestionCache = new Map<string, string>();
const categories = SPENDING_CATEGORIES;

const current = computed(() => queue.value[index.value] || null);

const HEBREW_RE = /[\u0590-\u05FF]/;

function looksHebrew(text: string): boolean {
  return HEBREW_RE.test(text);
}

function localEnglish(item: ReviewQueueItem): string {
  const suggested = item.display_english?.trim() || "";
  if (suggested && !looksHebrew(suggested)) return suggested;
  const stored = item.transaction.merchant_en?.trim() || "";
  if (stored && !looksHebrew(stored) && stored !== item.transaction.merchant_he.trim()) return stored;
  if (!looksHebrew(item.transaction.merchant_he)) return item.transaction.merchant_he.trim();
  return "";
}

async function loadSuggestionForCurrent() {
  const item = current.value;
  if (!item) {
    englishSuggestion.value = "";
    return;
  }

  category.value = item.transaction.category_en || "";
  const hebrew = item.transaction.merchant_he.trim();
  const known = localEnglish(item);
  if (known) {
    englishSuggestion.value = known;
    english.value = known;
    return;
  }

  if (suggestionCache.has(hebrew)) {
    const cached = suggestionCache.get(hebrew) || "";
    englishSuggestion.value = cached;
    english.value = cached;
    return;
  }

  if (auth.isDemo || !looksHebrew(hebrew)) {
    englishSuggestion.value = hebrew;
    english.value = hebrew;
    return;
  }

  suggesting.value = true;
  englishSuggestion.value = "";
  english.value = "";
  try {
    const translated = await fetchReviewSuggestion(hebrew, auth.token || undefined);
    suggestionCache.set(hebrew, translated);
    if (current.value?.transaction.merchant_he.trim() === hebrew) {
      englishSuggestion.value = translated;
      english.value = translated;
    }
  } finally {
    suggesting.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    const res = await fetchReviewQueue(
      auth.isDemo,
      {
        includeReviewed: includeReviewed.value,
        includeLabeled: includeLabeled.value,
        onePerMerchant: onePerMerchant.value,
      },
      auth.token || undefined,
    );
    queue.value = res.queue;
    reviewedCount.value = res.reviewed_count;
    index.value = 0;
    await loadSuggestionForCurrent();
  } finally {
    loading.value = false;
  }
}

function skip() {
  index.value += 1;
  void loadSuggestionForCurrent();
}

async function confirm() {
  if (!current.value || auth.isDemo) {
    skip();
    return;
  }
  const hebrew = current.value.transaction.merchant_he;
  confirming.value = true;
  try {
    const res = await confirmReview(
      {
        hebrew,
        english: english.value,
        category: category.value,
        mark_all_merchant: onePerMerchant.value,
        keys: [current.value.key],
      },
      auth.token || undefined,
    );
    reviewedCount.value = res.reviewed_count;
    if (onePerMerchant.value) {
      queue.value = queue.value.filter((item) => item.transaction.merchant_he !== hebrew);
      // Stay on same index — next merchant slides into place.
    } else {
      queue.value.splice(index.value, 1);
      if (index.value >= queue.value.length) {
        index.value = Math.max(0, queue.value.length - 1);
      }
    }
    suggestionCache.set(hebrew, english.value.trim());
    await loadSuggestionForCurrent();
  } finally {
    confirming.value = false;
  }
}

async function reset() {
  await resetReviewProgress(auth.token || undefined);
  await load();
}

watch(current, () => {
  void loadSuggestionForCurrent();
});
watch([onePerMerchant, includeLabeled, includeReviewed], load);
onMounted(load);
</script>
