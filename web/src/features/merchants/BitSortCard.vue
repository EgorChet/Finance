<template>
  <section v-if="unsorted.length || justSorted" class="bit-card">
    <div class="bit-card-head">
      <span class="tx-row-icon" aria-hidden="true">💸</span>
      <div class="bit-card-text">
        <p class="bit-card-title">
          <template v-if="unsorted.length">{{ t("{n} BIT {n|transfer|transfers} to sort", { n: unsorted.length }) }}</template>
          <template v-else>{{ t("All BIT transfers sorted ✓") }}</template>
        </p>
        <p class="bit-card-sub">
          <template v-if="unsorted.length">{{ formatIlsWhole(unsortedTotal) }} · {{ t("paying friends back, hairdresser, …") }}</template>
          <template v-else>{{ t("{n} sorted just now", { n: justSorted }) }}</template>
        </p>
      </div>
      <button v-if="unsorted.length && !auth.readOnly" type="button" class="btn btn-primary bit-card-cta" @click="start">
        {{ t("Sort") }}
      </button>
    </div>

    <BottomSheet :open="!!current" @close="current = null">
      <template #head>
        <div v-if="current" class="rv-sheet-head">
          <p class="rv-sheet-step">{{ t("{n} of {total} · BIT transfer", { n: position, total: unsorted.length }) }}</p>
          <p class="bit-sheet-amount">{{ formatIls(current.charge_amount) }}</p>
          <p class="rv-sheet-meta">{{ formatTransactionDate(current.date) }} · {{ t("what was it for?") }}</p>
        </div>
      </template>
      <CategoryPicker v-if="current" :model-value="''" :options="BIT_OPTIONS" :suggestions="suggestions" @pick="pick" />
      <p v-if="error" class="tx-cat-error">{{ error }}</p>
      <template #footer>
        <button type="button" class="btn" :disabled="saving" @click="next">{{ t("Skip") }}</button>
        <button type="button" class="btn" :disabled="saving" @click="pick('BIT')">{{ t("Keep as BIT") }}</button>
      </template>
    </BottomSheet>
  </section>
</template>

<script setup lang="ts">
import { catName, t } from "@/shared/i18n";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import BottomSheet from "@/shared/components/BottomSheet.vue";
import CategoryPicker from "@/shared/components/CategoryPicker.vue";
import { showToast } from "@/shared/composables/useToast";
import { bitSuggestions } from "@/shared/utils/categorySuggest";
import { useAuthStore } from "@/shared/stores/auth";
import { useHomeDataStore } from "@/features/home/stores/homeData";
import { onSpendingRefresh } from "@/features/spending/composables/useSpendingRefresh";
import { isBitTransfer, saveChargeCategory } from "@/shared/composables/useChargeCategory";
import { CATEGORY_PICKLIST } from "@/shared/categories";
import type { Transaction } from "@/shared/types";
import { formatIls, formatIlsWhole, formatTransactionDate } from "@/shared/utils/format";
import { friendlyError } from "@/shared/utils/friendlyError";
import { transactionKey } from "@/shared/utils/transactionKey";

const props = defineProps<{
  /** Charges to look in (e.g. the month shown on Spending); omitted → the last 7 months. */
  transactions?: Transaction[];
}>();

/** Everything except BIT itself — the point is to say what the transfer was for. */
const BIT_OPTIONS = CATEGORY_PICKLIST.filter((c) => c !== "BIT" && c !== "Uncategorized");

const auth = useAuthStore();
const homeData = useHomeDataStore();
const transactions = ref<Transaction[]>([]);
const current = ref<Transaction | null>(null);
const saving = ref(false);
const error = ref("");
const justSorted = ref(0);
/** Skipped or kept-as-BIT this session, so "next" moves on. */
const passed = ref(new Set<string>());

const unsorted = computed(() =>
  transactions.value
    .filter((t) => isBitTransfer(t) && !t.category_override && t.charge_amount > 0)
    .filter((t) => !passed.value.has(transactionKey(t)))
    .sort((a, b) => b.date.localeCompare(a.date)),
);
const suggestions = computed(() => bitSuggestions(transactions.value));
const unsortedTotal = computed(() => unsorted.value.reduce((s, t) => s + t.charge_amount, 0));
const position = computed(() => (current.value ? unsorted.value.findIndex((t) => transactionKey(t) === transactionKey(current.value!)) + 1 : 0));

async function load() {
  if (props.transactions) {
    transactions.value = props.transactions;
    return;
  }
  try {
    const bundle = await homeData.load(auth.isDemo, auth.token || undefined);
    transactions.value = bundle.report?.transactions ?? [];
  } catch {
    transactions.value = [];
  }
}

function start() {
  error.value = "";
  current.value = unsorted.value[0] ?? null;
}

function next() {
  if (!current.value) return;
  const key = transactionKey(current.value);
  passed.value = new Set([...passed.value, key]);
  current.value = unsorted.value[0] ?? null;
}

async function pick(category: string) {
  const tx = current.value;
  if (!tx || saving.value) return;
  if (category === "BIT") {
    next();
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    await saveChargeCategory(tx, category);
    justSorted.value += 1;
    showToast(t("Changed to {name}", { name: catName(category) }), {
      label: t("Undo"),
      run: () => {
        void saveChargeCategory(tx, null).catch(() => undefined);
        justSorted.value = Math.max(0, justSorted.value - 1);
        transactions.value = transactions.value.map((t) =>
          transactionKey(t) === transactionKey(tx) ? { ...t, category_override: undefined, category_en: t.category_original ?? t.category_en } : t,
        );
      },
    });
    // Mark locally right away; the refresh brings the server's version.
    transactions.value = transactions.value.map((t) =>
      transactionKey(t) === transactionKey(tx) ? { ...t, category_override: category, category_en: category } : t,
    );
    current.value = unsorted.value[0] ?? null;
  } catch (e) {
    error.value = friendlyError(e);
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.transactions,
  () => {
    if (props.transactions) transactions.value = props.transactions;
  },
);

let stop: (() => void) | undefined;
onMounted(() => {
  void load();
  if (!props.transactions) stop = onSpendingRefresh(() => void load());
});
onUnmounted(() => stop?.());
</script>
