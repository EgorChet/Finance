<template>
  <div class="rv">
    <div v-if="auth.isDemo" class="demo-banner">Demo mode — sample queue only. Sign in to label your real charges.</div>
    <div v-else-if="auth.readOnly" class="demo-banner">View only — Egor labels charges. You can browse the queue.</div>

    <AppLoader v-if="loading" variant="card" title="Loading queue" subtitle="Finding charges that still need a label" />

    <template v-else>
      <section class="rv-hero" :class="{ 'rv-hero--done': !queue.length }">
        <template v-if="queue.length">
          <p class="rv-hero-value">{{ queue.length }}</p>
          <p class="rv-hero-label">{{ queue.length === 1 ? "merchant needs" : "merchants need" }} a name and category</p>
          <button v-if="!auth.readOnly || auth.isDemo" type="button" class="btn btn-primary rv-hero-cta" @click="openAt(0)">
            Start labelling
          </button>
        </template>
        <template v-else>
          <p class="rv-hero-value">✓</p>
          <p class="rv-hero-label">Everything is labelled</p>
          <p class="rv-hero-sub">New merchants show up here after the next statement upload.</p>
        </template>
        <p v-if="savedThisSession > 0" class="rv-hero-sub">{{ savedThisSession }} saved just now · {{ reviewedCount }} in total</p>
      </section>

      <div class="find-chips rv-filters" role="toolbar" aria-label="What to show">
        <button type="button" class="find-chip" :class="{ 'find-chip--on': onePerMerchant }" :aria-pressed="onePerMerchant" @click="onePerMerchant = !onePerMerchant">
          {{ onePerMerchant ? "✓ " : "" }}One per store
        </button>
        <button type="button" class="find-chip" :class="{ 'find-chip--on': includeLabeled }" :aria-pressed="includeLabeled" @click="includeLabeled = !includeLabeled">
          {{ includeLabeled ? "✓ " : "" }}Already named
        </button>
        <button type="button" class="find-chip" :class="{ 'find-chip--on': includeReviewed }" :aria-pressed="includeReviewed" @click="includeReviewed = !includeReviewed">
          {{ includeReviewed ? "✓ " : "" }}Already done
        </button>
        <button type="button" class="find-chip" @click="() => load({ force: true })">↻ Refresh</button>
        <button v-if="!auth.readOnly" type="button" class="find-chip" @click="reset">Reset progress</button>
      </div>

      <div v-if="queue.length" class="rv-list">
        <button v-for="(item, i) in queue" :key="item.key" type="button" class="rv-row" @click="openAt(i)">
          <span class="tx-row-icon" aria-hidden="true">{{ categoryIcon(item.transaction.category_en || "Uncategorized") }}</span>
          <span class="rv-row-body">
            <span class="rv-row-top">
              <span class="rv-row-he" dir="rtl" lang="he">{{ item.transaction.merchant_he }}</span>
              <span class="rv-row-amount">{{ formatIls(item.transaction.charge_amount) }}</span>
            </span>
            <span class="rv-row-meta">
              <span v-if="englishFor(item)" class="rv-row-en">{{ englishFor(item) }} · </span>
              {{ item.occurrence_count > 1 ? `${item.occurrence_count} charges` : formatTransactionDate(item.transaction.date) }}
            </span>
          </span>
        </button>
      </div>
      <p v-else-if="includeLabeled || includeReviewed" class="rv-empty">Nothing matches these filters.</p>
    </template>

    <BottomSheet :open="sheetOpen && !!current" @close="sheetOpen = false">
      <template #head>
        <div v-if="current" class="rv-sheet-head">
          <p class="rv-sheet-step">{{ index + 1 }} of {{ queue.length }}</p>
          <p class="rv-sheet-he" dir="rtl" lang="he">{{ current.transaction.merchant_he }}</p>
          <p class="rv-sheet-meta">
            {{ formatIls(current.transaction.charge_amount) }} · {{ formatTransactionDate(current.transaction.date) }}
            <template v-if="current.occurrence_count > 1"> · {{ current.occurrence_count }} charges<template v-if="onePerMerchant">, all get this label</template></template>
          </p>
        </div>
      </template>

      <label v-if="current" class="rv-field">
        <span class="rv-field-label">
          English name
          <span v-if="suggesting" class="rv-field-hint">translating…</span>
          <span v-else-if="englishSuggestion && english === englishSuggestion" class="rv-field-hint">suggested</span>
        </span>
        <input
          v-model="english"
          class="input"
          autocomplete="off"
          autocapitalize="words"
          enterkeyhint="done"
          :placeholder="suggesting ? 'Translating…' : 'e.g. Shufersal, Wolt, Arcaffe'"
        />
      </label>

      <p class="rv-field-label">Category</p>
      <CategoryGrid v-model="category" :options="categories" />

      <template #footer>
        <button type="button" class="btn" :disabled="confirming" @click="skip">Skip</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="suggesting || confirming || !english.trim()"
          @click="save"
        >
          {{ confirming ? "Saving…" : queue.length > 1 ? "Save & next" : "Save" }}
        </button>
      </template>
    </BottomSheet>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { confirmReview, fetchReviewSuggestion, resetReviewProgress } from "@/shared/api/client";
import AppLoader from "@/shared/components/AppLoader.vue";
import BottomSheet from "@/shared/components/BottomSheet.vue";
import CategoryGrid from "@/shared/components/CategoryGrid.vue";
import { useAuthStore } from "@/shared/stores/auth";
import { invalidateRulesDataCaches } from "@/shared/stores/invalidateCaches";
import { useReviewDataStore, type ReviewQueueBundle } from "@/features/merchants/stores/reviewData";
import { confirm as askConfirm } from "@/shared/composables/useConfirm";
import type { ReviewQueueItem } from "@/shared/types";
import { CATEGORY_PICKLIST } from "@/shared/categories";
import { formatIls, formatTransactionDate } from "@/shared/utils/format";
import { categoryIcon } from "@/features/spending/utils/categoryIcons";

withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false });

const auth = useAuthStore();
const reviewData = useReviewDataStore();
const queue = ref<ReviewQueueItem[]>([]);
const reviewedCount = ref(0);
const savedThisSession = ref(0);
const loading = ref(false);
const suggesting = ref(false);
const confirming = ref(false);
const index = ref(0);
const sheetOpen = ref(false);
const english = ref("");
const category = ref("");
const englishSuggestion = ref("");
const onePerMerchant = ref(true);
const includeLabeled = ref(false);
const includeReviewed = ref(false);

const suggestionCache = new Map<string, string>();
const categories = CATEGORY_PICKLIST;
const current = computed(() => queue.value[index.value] || null);

const HEBREW_RE = /[֐-׿]/;
const looksHebrew = (text: string) => HEBREW_RE.test(text);

/** English name we already know without translating (saved label or a non-Hebrew statement name). */
function englishFor(item: ReviewQueueItem): string {
  const suggested = item.display_english?.trim() || "";
  if (suggested && !looksHebrew(suggested)) return suggested;
  const stored = item.transaction.merchant_en?.trim() || "";
  if (stored && !looksHebrew(stored) && stored !== item.transaction.merchant_he.trim()) return stored;
  if (!looksHebrew(item.transaction.merchant_he)) return item.transaction.merchant_he.trim();
  return suggestionCache.get(item.transaction.merchant_he.trim()) ?? "";
}

async function loadSuggestionForCurrent() {
  const item = current.value;
  if (!item) {
    englishSuggestion.value = "";
    return;
  }
  category.value = item.transaction.category_en && item.transaction.category_en !== "Uncategorized" ? item.transaction.category_en : "";
  const hebrew = item.transaction.merchant_he.trim();
  const known = englishFor(item);
  if (known || auth.isDemo || !looksHebrew(hebrew)) {
    englishSuggestion.value = known || hebrew;
    english.value = englishSuggestion.value;
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

function openAt(i: number) {
  index.value = i;
  sheetOpen.value = true;
  void loadSuggestionForCurrent();
}

function reviewOptions() {
  return {
    includeReviewed: includeReviewed.value,
    includeLabeled: includeLabeled.value,
    onePerMerchant: onePerMerchant.value,
  };
}

function applyQueue(res: ReviewQueueBundle) {
  queue.value = res.queue;
  reviewedCount.value = res.reviewed_count;
  if (index.value >= queue.value.length) index.value = 0;
}

async function load(options: { background?: boolean; force?: boolean } = {}) {
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  const opts = reviewOptions();
  const cached = !options.force && !options.background && reviewData.peek(demo, token, opts);
  if (cached) {
    applyQueue(cached);
    loading.value = false;
    void load({ background: true });
    return;
  }
  if (!options.background) loading.value = true;
  try {
    applyQueue(await reviewData.load(demo, token, opts, options));
  } finally {
    if (!options.background) loading.value = false;
  }
}

function advance() {
  if (!queue.value.length) {
    sheetOpen.value = false;
    return;
  }
  if (index.value >= queue.value.length) index.value = 0;
  void loadSuggestionForCurrent();
}

function skip() {
  if (index.value + 1 >= queue.value.length) {
    sheetOpen.value = false;
    return;
  }
  index.value += 1;
  void loadSuggestionForCurrent();
}

async function save() {
  const item = current.value;
  if (!item) return;
  if (auth.readOnly) {
    skip();
    return;
  }
  const hebrew = item.transaction.merchant_he;
  confirming.value = true;
  try {
    const res = await confirmReview(
      {
        hebrew,
        english: english.value,
        category: category.value,
        mark_all_merchant: onePerMerchant.value,
        keys: [item.key],
      },
      auth.token || undefined,
    );
    reviewedCount.value = res.reviewed_count;
    savedThisSession.value += 1;
    suggestionCache.set(hebrew.trim(), english.value.trim());
    queue.value = onePerMerchant.value
      ? queue.value.filter((q) => q.transaction.merchant_he !== hebrew)
      : queue.value.filter((q) => q.key !== item.key);
    invalidateRulesDataCaches();
    advance();
  } finally {
    confirming.value = false;
  }
}

async function reset() {
  const ok = await askConfirm({
    title: "Reset progress?",
    message: "Show merchants you already went through again? Saved names and categories stay.",
    confirmLabel: "Reset",
    tone: "danger",
  });
  if (!ok) return;
  await resetReviewProgress(auth.token || undefined);
  await load({ force: true });
}

watch([onePerMerchant, includeLabeled, includeReviewed], () => {
  void load({ force: true });
});
onMounted(load);
</script>
