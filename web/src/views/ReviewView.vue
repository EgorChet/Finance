<template>
  <div class="review-page" :class="{ 'review-page--has-bar': !!current && !loading }">
    <div v-if="auth.isDemo" class="demo-banner">Demo mode — sample queue only. Sign in to label your real charges.</div>

    <h2 class="page-title">Label merchants</h2>
    <p v-if="!current || loading" class="page-lead">
      Hebrew names from your card statement get an English name and spending category. Once saved, the same store is
      labeled automatically on future uploads.
    </p>
    <p v-else class="page-lead review-swipe-hint">Swipe the card right to save, left to skip — or use the buttons below.</p>

    <div v-if="!loading && queue.length > 0" class="review-progress" aria-live="polite">
      <div class="review-progress-track" role="progressbar" :aria-valuenow="cardNumber" :aria-valuemax="totalInQueue">
        <div class="review-progress-fill" :style="{ width: `${progressPercent}%` }" />
      </div>
      <p class="review-progress-label">
        <strong>{{ cardNumber }} of {{ totalInQueue }}</strong>
        <span v-if="remainingAfterCurrent > 0"> · {{ remainingAfterCurrent }} left after this one</span>
      </p>
      <p v-if="reviewedCount > 0" class="review-progress-meta">{{ reviewedCount }} places already labeled in this app</p>
    </div>

    <details class="review-options-panel">
      <summary class="review-options-summary">What to show in the queue</summary>
      <div class="review-options-body">
        <label class="review-option">
          <ToggleSwitch v-model="onePerMerchant" />
          <span class="review-option-text">
            <strong>One card per store</strong>
            <span class="review-option-hint">Group all charges with the same name — one label covers every charge</span>
          </span>
        </label>
        <label class="review-option">
          <ToggleSwitch v-model="includeLabeled" />
          <span class="review-option-text">
            <strong>Show already saved</strong>
            <span class="review-option-hint">Include stores that already have an English name and category saved</span>
          </span>
        </label>
        <label class="review-option">
          <ToggleSwitch v-model="includeReviewed" />
          <span class="review-option-text">
            <strong>Show already done</strong>
            <span class="review-option-hint">Include stores you already confirmed in this screen</span>
          </span>
        </label>
        <div class="review-options-actions">
          <button type="button" class="btn btn-compact" @click="load">Refresh queue</button>
          <button v-if="!auth.isDemo" type="button" class="btn btn-compact btn-ghost" @click="reset">
            Clear progress
          </button>
        </div>
        <p class="review-options-footnote">
          Clearing progress only resets what you clicked through — your saved labels stay in Merchant mappings.
        </p>
      </div>
    </details>

    <AppLoader
      v-if="loading"
      title="Loading queue"
      subtitle="Finding charges that still need a label"
    />

    <div v-else-if="queue.length === 0" class="review-empty-state">
      <p class="review-empty-title">Nothing to label right now</p>
      <p class="review-empty-text">
        <template v-if="!includeLabeled && !includeReviewed">
          Every charge either already has a saved label or was marked done. Upload a new statement to see fresh
          merchants, or turn on the filters above to revisit old ones.
        </template>
        <template v-else>
          No charges match your current filters. Try turning off “Show already saved” or “Show already done”.
        </template>
      </p>
    </div>

    <div v-else-if="!current" class="review-empty-state">
      <p class="review-empty-title">Queue finished</p>
      <p class="review-empty-text">You reached the end of this batch. Refresh to check for new charges, or start from the top.</p>
      <button type="button" class="btn btn-primary review-empty-action" @click="index = 0">Start from the top</button>
    </div>

    <div v-else class="review-swipe-stage">
      <article v-if="nextItem" class="review-card review-card--back" aria-hidden="true">
        <header class="review-card-head">
          <span class="review-card-badge">Up next</span>
          <span class="review-card-amount">{{ formatIls(nextItem.transaction.charge_amount) }}</span>
        </header>
        <p class="review-merchant-he review-merchant-he--compact" dir="rtl" lang="he">
          {{ nextItem.transaction.merchant_he }}
        </p>
      </article>

      <article
        ref="cardEl"
        class="review-card review-card--active"
        :class="{
          'review-card--dragging': isDragging,
          'review-card--exiting': isExiting,
          'review-card--shake': showSaveBlocked,
        }"
        :style="activeCardStyle"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <div
          class="review-swipe-overlay review-swipe-overlay--save"
          :style="{ opacity: saveOverlayOpacity }"
          aria-hidden="true"
        >
          SAVE
        </div>
        <div
          class="review-swipe-overlay review-swipe-overlay--skip"
          :style="{ opacity: skipOverlayOpacity }"
          aria-hidden="true"
        >
          SKIP
        </div>

        <div class="review-card-swipe-body">
          <header class="review-card-head">
            <span class="review-card-badge">Needs label</span>
            <span class="review-card-amount">{{ formatIls(current.transaction.charge_amount) }}</span>
          </header>

          <p class="review-card-meta">
            {{ formatTransactionDate(current.transaction.date) }}
            <span v-if="current.transaction.billing_month"> · {{ current.transaction.billing_month }}</span>
          </p>

          <div class="review-merchant-block">
            <span class="review-merchant-label">On your statement</span>
            <p class="review-merchant-he" dir="rtl" lang="he">{{ current.transaction.merchant_he }}</p>
            <p v-if="current.occurrence_count > 1" class="review-merchant-note">
              {{ current.occurrence_count }} charges with this name
              <span v-if="onePerMerchant"> — saving applies to all of them</span>
            </p>
          </div>
        </div>

        <div class="review-card-form">
          <label class="review-field">
            <span class="review-field-label">
              English name
              <span v-if="suggesting" class="review-field-hint">Translating…</span>
              <span v-else-if="englishSuggestion && english === englishSuggestion" class="review-field-hint">Suggested — edit if needed</span>
            </span>
            <input
              v-model="english"
              class="input"
              autocomplete="off"
              autocapitalize="words"
              enterkeyhint="next"
              :placeholder="suggesting ? 'Translating…' : 'e.g. Shufersal, Wolt, Arcaffe'"
            />
          </label>

          <label class="review-field">
            <span class="review-field-label">Spending category</span>
            <CategorySelect v-model="category" :options="categories" allow-empty empty-label="Pick a category…" />
          </label>

          <p v-if="!english.trim() && !suggesting" class="review-field-note">Add an English name before swiping right to save.</p>
        </div>
      </article>
    </div>

    <div v-if="current && !loading" class="review-action-bar">
      <button
        type="button"
        class="review-circle-btn review-circle-btn--skip"
        :disabled="confirming || isExiting"
        aria-label="Skip"
        @click="flyOut('left', skip)"
      >
        ✕
      </button>
      <button
        type="button"
        class="review-circle-btn review-circle-btn--save"
        :disabled="suggesting || confirming || !english.trim() || isExiting"
        aria-label="Save and next"
        @click="flyOut('right', confirm)"
      >
        ✓
      </button>
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
import AppLoader from "../components/AppLoader.vue";
import CategorySelect from "../components/CategorySelect.vue";
import ToggleSwitch from "../components/ToggleSwitch.vue";
import { useAuthStore } from "../stores/auth";
import { confirm as askConfirm } from "../composables/useConfirm";
import type { ReviewQueueItem } from "../types";
import { CATEGORY_PICKLIST } from "../categories";
import { formatIls, formatTransactionDate } from "../utils/format";

const SWIPE_THRESHOLD = 90;
const SWIPE_MAX_ROTATION = 14;

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

const cardEl = ref<HTMLElement | null>(null);
const swipeX = ref(0);
const isDragging = ref(false);
const isExiting = ref(false);
const showSaveBlocked = ref(false);

let pointerId: number | null = null;
let startX = 0;
let startY = 0;
let tracking = false;
let decided = false;

const suggestionCache = new Map<string, string>();
const categories = CATEGORY_PICKLIST;

const current = computed(() => queue.value[index.value] || null);
const nextItem = computed(() => queue.value[index.value + 1] || null);
const totalInQueue = computed(() => queue.value.length);
const cardNumber = computed(() => Math.min(index.value + 1, totalInQueue.value || 1));
const remainingAfterCurrent = computed(() => Math.max(totalInQueue.value - cardNumber.value, 0));
const progressPercent = computed(() => {
  if (!totalInQueue.value) return 0;
  return Math.min(100, Math.round((cardNumber.value / totalInQueue.value) * 100));
});

const activeCardStyle = computed(() => {
  if (showSaveBlocked.value) return {};
  const rotate = Math.max(-SWIPE_MAX_ROTATION, Math.min(SWIPE_MAX_ROTATION, swipeX.value * 0.06));
  return {
    transform: `translateX(${swipeX.value}px) rotate(${rotate}deg)`,
    transition: isDragging.value ? "none" : "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
  };
});

const saveOverlayOpacity = computed(() => Math.min(Math.max(swipeX.value / SWIPE_THRESHOLD, 0), 1));
const skipOverlayOpacity = computed(() => Math.min(Math.max(-swipeX.value / SWIPE_THRESHOLD, 0), 1));

const HEBREW_RE = /[\u0590-\u05FF]/;

function looksHebrew(text: string): boolean {
  return HEBREW_RE.test(text);
}

function canStartSwipe(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(".review-card-form")) return false;
  if (target.closest("details")) return false;
  if (target.closest("button")) return false;
  return true;
}

function resetSwipe() {
  swipeX.value = 0;
  isDragging.value = false;
  isExiting.value = false;
  showSaveBlocked.value = false;
  pointerId = null;
  tracking = false;
  decided = false;
}

function onPointerDown(e: PointerEvent) {
  if (isExiting.value || confirming.value || !canStartSwipe(e.target)) return;
  pointerId = e.pointerId;
  startX = e.clientX;
  startY = e.clientY;
  tracking = true;
  decided = false;
  cardEl.value?.setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!tracking || pointerId !== e.pointerId || isExiting.value) return;

  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  if (!decided) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    if (Math.abs(dy) > Math.abs(dx)) {
      tracking = false;
      cardEl.value?.releasePointerCapture(e.pointerId);
      return;
    }
    decided = true;
    isDragging.value = true;
  }

  swipeX.value = dx;
}

async function onPointerUp(e: PointerEvent) {
  if (!tracking || pointerId !== e.pointerId) return;
  tracking = false;
  isDragging.value = false;
  cardEl.value?.releasePointerCapture(e.pointerId);

  if (swipeX.value > SWIPE_THRESHOLD) {
    if (!english.value.trim()) {
      await snapBackBlocked();
      return;
    }
    await flyOut("right", confirm);
    return;
  }

  if (swipeX.value < -SWIPE_THRESHOLD) {
    await flyOut("left", skip);
    return;
  }

  swipeX.value = 0;
}

async function snapBackBlocked() {
  showSaveBlocked.value = true;
  swipeX.value = 0;
  await new Promise((r) => setTimeout(r, 450));
  showSaveBlocked.value = false;
}

async function flyOut(direction: "left" | "right", action: () => void | Promise<void>) {
  if (isExiting.value) return;
  if (direction === "right" && !english.value.trim()) {
    await snapBackBlocked();
    return;
  }

  isExiting.value = true;
  isDragging.value = false;
  const offScreen = direction === "right" ? window.innerWidth * 1.15 : -window.innerWidth * 1.15;
  swipeX.value = offScreen;
  await new Promise((r) => setTimeout(r, 300));
  await action();
  resetSwipe();
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
    resetSwipe();
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
  const ok = await askConfirm({
    title: "Clear progress?",
    message: "Clear your review progress? Saved merchant labels will not be deleted.",
    confirmLabel: "Clear progress",
    tone: "danger",
  });
  if (!ok) return;
  await resetReviewProgress(auth.token || undefined);
  await load();
}

watch(current, () => {
  resetSwipe();
  void loadSuggestionForCurrent();
});
watch([onePerMerchant, includeLabeled, includeReviewed], load);
onMounted(load);
</script>
