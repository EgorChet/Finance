<template>
  <div class="rv">
    <div v-if="auth.isDemo" class="demo-banner">Demo mode — sample queue only. Sign in to label your real charges.</div>

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

      <BitSortCard />

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
          <MerchantIcon
            :merchant-he="item.transaction.merchant_he"
            :merchant-en="item.transaction.merchant_en"
            :category="item.transaction.category_en || 'Uncategorized'"
          />
          <span class="rv-row-body">
            <span class="rv-row-top">
              <span class="rv-row-name">{{ rowTitle(item) }}</span>
              <span class="rv-row-amount">{{ formatIls(item.transaction.charge_amount) }}</span>
            </span>
            <span class="rv-row-meta">
              <span v-if="rowTitle(item) !== item.transaction.merchant_he" class="rv-row-he" dir="rtl" lang="he">{{ item.transaction.merchant_he }}</span>
              <span>{{ item.occurrence_count > 1 ? `${item.occurrence_count} charges` : formatTransactionDate(item.transaction.date) }}</span>
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
          <p class="rv-sheet-title">{{ hints?.translation || rowTitle(current) }}</p>
          <p class="rv-sheet-he-small" dir="rtl" lang="he">{{ current.transaction.merchant_he }}</p>
          <p class="rv-sheet-meta">
            {{ formatIls(current.transaction.charge_amount) }} · {{ formatTransactionDate(current.transaction.date) }}
            <template v-if="current.occurrence_count > 1"> · {{ current.occurrence_count }} charges<template v-if="onePerMerchant">, all get this label</template></template>
          </p>
        </div>
      </template>

      <section v-if="current" class="rv-hints" aria-live="polite">
        <div v-if="hintsLoading" class="rv-ai rv-ai--loading">
          <span class="rv-ai-badge">🐶 Totoshka</span>
          <span>Loading hints…</span>
        </div>
        <div v-else-if="hints?.ai" class="rv-ai">
          <div class="rv-ai-top">
            <span class="rv-ai-badge">🐶 Totoshka's guess<template v-if="hints.ai.confidence !== 'high'"> · {{ hints.ai.confidence }} confidence</template></span>
            <button
              v-if="english !== hints.ai.english_name || category !== hints.ai.category"
              type="button"
              class="rv-ai-use"
              @click="useAiGuess"
            >
              Use
            </button>
          </div>
          <p class="rv-ai-guess">{{ hints.ai.english_name }} · {{ hints.ai.category }}</p>
          <p class="rv-ai-reason">{{ hints.ai.reason }}</p>
        </div>
        <p v-else-if="hints?.ai_status === 'waiting' && !auth.isDemo" class="rv-hint-line rv-hint-muted">
          🐶 Totoshka hasn't looked at this one yet. Ask it in Telegram to "guess my new merchants".
        </p>

        <p v-if="hints?.bank_category" class="rv-hint-line">
          <span class="rv-hint-label">Bank calls it</span> {{ hints.bank_category }}
        </p>
        <div v-if="hints?.same_day.length" class="rv-hint-block">
          <p class="rv-hint-label">Same day you also paid</p>
          <div class="rv-hint-chips">
            <span v-for="(d, i) in hints.same_day" :key="i" class="rv-hint-chip">
              {{ d.merchant }} <b>{{ formatIlsWhole(d.amount) }}</b>
            </span>
          </div>
        </div>
        <div v-if="hints && hints.history.length > 1" class="rv-hint-block">
          <p class="rv-hint-label">
            Every charge here
            <template v-if="historyPattern"> — {{ historyPattern }}</template>
          </p>
          <div class="rv-hint-chips">
            <span v-for="(h, i) in hints.history" :key="i" class="rv-hint-chip">{{ formatTransactionDate(h.date) }} <b>{{ formatIlsWhole(h.amount) }}</b></span>
          </div>
        </div>
      </section>

      <label v-if="current" class="rv-field">
        <span class="rv-field-label">
          English name
          <span v-if="hintsLoading && !english" class="rv-field-hint">translating…</span>
        </span>
        <input
          v-model="english"
          class="input"
          @input="englishTouched = true"
          autocomplete="off"
          autocapitalize="words"
          enterkeyhint="done"
          :placeholder="hintsLoading ? 'Translating…' : 'e.g. Shufersal, Wolt, Arcaffe'"
        />
      </label>

      <p class="rv-field-label">Category</p>
      <CategoryGrid v-model="category" :options="categories" />

      <template #footer>
        <button type="button" class="btn" :disabled="confirming" @click="skip">Skip</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="confirming || !english.trim()"
          @click="save"
        >
          {{ confirming ? "Saving…" : queue.length > 1 ? "Save & next" : "Save" }}
        </button>
      </template>
    </BottomSheet>
  </div>
</template>

<script setup lang="ts">
import { knownMerchantName } from "@/shared/utils/merchantNames";
import { computed, onMounted, ref, watch } from "vue";
import { confirmReview, fetchLabelHints, fetchReviewSuggestion, resetReviewProgress, type LabelHints } from "@/shared/api/client";
import AppLoader from "@/shared/components/AppLoader.vue";
import BitSortCard from "@/features/merchants/BitSortCard.vue";
import BottomSheet from "@/shared/components/BottomSheet.vue";
import MerchantIcon from "@/shared/components/MerchantIcon.vue";
import CategoryGrid from "@/shared/components/CategoryGrid.vue";
import { useAuthStore } from "@/shared/stores/auth";
import { invalidateRulesDataCaches } from "@/shared/stores/invalidateCaches";
import { useReviewDataStore, type ReviewQueueBundle } from "@/features/merchants/stores/reviewData";
import { confirm as askConfirm } from "@/shared/composables/useConfirm";
import type { ReviewQueueItem } from "@/shared/types";
import { CATEGORY_PICKLIST } from "@/shared/categories";
import { formatIls, formatIlsWhole, formatTransactionDate } from "@/shared/utils/format";

withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false });

const auth = useAuthStore();
const reviewData = useReviewDataStore();
const queue = ref<ReviewQueueItem[]>([]);
const reviewedCount = ref(0);
const savedThisSession = ref(0);
const loading = ref(false);
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
  // A known English name (chains, easy translations) — confirm with one tap.
  const known = knownMerchantName(item.transaction.merchant_he);
  if (known) return known;
  return suggestionCache.get(item.transaction.merchant_he.trim()) ?? "";
}

const hints = ref<LabelHints | null>(null);
const hintsLoading = ref(false);
const englishTouched = ref(false);
/** Translations for the list rows, filled in the background. */
const rowEnglish = ref<Record<string, string>>({});

function rowTitle(item: ReviewQueueItem): string {
  const hebrew = item.transaction.merchant_he.trim();
  return englishFor(item) || rowEnglish.value[hebrew] || hebrew;
}

/** Translate list rows a few at a time so the list reads in English. */
async function translateRows() {
  if (auth.isDemo) return;
  const todo = [...new Set(
    queue.value
      .filter((item) => !englishFor(item) && looksHebrew(item.transaction.merchant_he))
      .map((item) => item.transaction.merchant_he.trim())
      .filter((h) => !(h in rowEnglish.value)),
  )];
  const worker = async () => {
    for (let h = todo.shift(); h; h = todo.shift()) {
      try {
        const en = await fetchReviewSuggestion(h, auth.token || undefined);
        rowEnglish.value = { ...rowEnglish.value, [h]: en };
        if (en) suggestionCache.set(h, en);
      } catch {
        rowEnglish.value = { ...rowEnglish.value, [h]: "" };
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

const historyPattern = computed(() => {
  const h = hints.value?.history ?? [];
  if (h.length < 3) return "";
  const amounts = h.map((x) => x.amount);
  const same = amounts.every((a) => Math.abs(a - amounts[0]) < 1);
  return same ? "same amount every time, looks like a subscription or regular bill" : "";
});

function useAiGuess() {
  const ai = hints.value?.ai;
  if (!ai) return;
  english.value = ai.english_name;
  category.value = ai.category;
  englishTouched.value = true;
}

async function loadSuggestionForCurrent() {
  const item = current.value;
  hints.value = null;
  englishTouched.value = false;
  if (!item) {
    englishSuggestion.value = "";
    return;
  }
  category.value = item.transaction.category_en && item.transaction.category_en !== "Uncategorized" ? item.transaction.category_en : "";
  const hebrew = item.transaction.merchant_he.trim();
  const known = englishFor(item);
  englishSuggestion.value = known;
  english.value = known;

  hintsLoading.value = true;
  try {
    const res = await fetchLabelHints(auth.isDemo, item.transaction, auth.token || undefined);
    if (current.value?.key !== item.key) return;
    hints.value = res;
    if (res.translation) suggestionCache.set(hebrew, res.translation);
    if (!englishTouched.value && !known) {
      english.value = res.ai?.english_name || res.translation || (looksHebrew(hebrew) ? "" : hebrew);
      englishSuggestion.value = english.value;
    }
    if (res.ai && res.ai.confidence !== "low" && (!category.value || !item.transaction.merchant_known)) {
      category.value = res.ai.category;
    }
  } catch {
    if (!english.value && !looksHebrew(hebrew)) english.value = hebrew;
  } finally {
    if (current.value?.key === item.key) hintsLoading.value = false;
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
  void translateRows();
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
