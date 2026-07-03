<template>
  <div>
    <div v-if="auth.isDemo" class="demo-banner">Demo mode — sample transactions only.</div>
    <h2 class="page-title">Browse transactions</h2>
    <p class="page-lead">
      Search all charges by merchant, category, amount, or billing month.
    </p>

    <AppLoader
      v-if="loading"
      title="Loading transactions"
      subtitle="Fetching your statement history"
    />
    <template v-else>
      <p v-if="error" class="browse-error">{{ error }}</p>
      <template v-else>
        <div class="browse-filters">
          <input
            v-model="searchQuery"
            class="input browse-search"
            type="search"
            placeholder="Merchant — e.g. Arc Cafe, OpenAI"
            autocomplete="off"
          />

          <div class="browse-filter-row browse-filter-row--month-recurring">
            <label class="field-group browse-field">
              <span class="field-label">Month</span>
              <select v-model="selectedMonth" class="input select-field">
                <option value="">All months</option>
                <option v-for="m in months" :key="m.key" :value="m.key">{{ m.label }}</option>
              </select>
            </label>
            <div class="field-group browse-field browse-recurring-field">
              <span class="field-label">Recurring</span>
              <label class="browse-recurring-toggle">
                <ToggleSwitch v-model="includeRecurring" />
                <span>Include recurring charges</span>
              </label>
            </div>
          </div>

          <div class="browse-filter-row browse-filter-row--single">
            <label class="field-group browse-field">
              <span class="field-label">Category</span>
              <CategorySelect
                v-model="categoryFilter"
                :options="categoryOptions"
                allow-empty
                empty-label="Any category"
              />
            </label>
          </div>

          <div class="browse-amount">
            <span class="field-label">Amount (₪)</span>
            <div class="browse-amount-chips">
              <button
                v-for="chip in amountPresets"
                :key="chip.label"
                type="button"
                class="browse-chip"
                :class="{ active: activePreset === chip.id }"
                @click="applyPreset(chip)"
              >
                {{ chip.label }}
              </button>
            </div>
            <div class="browse-amount-inputs">
              <input
                :value="minAmount"
                class="input"
                type="number"
                min="0"
                step="1"
                placeholder="Min"
                inputmode="decimal"
                @input="minAmount = ($event.target as HTMLInputElement).value"
              />
              <span class="browse-amount-sep">–</span>
              <input
                :value="maxAmount"
                class="input"
                type="number"
                min="0"
                step="1"
                placeholder="Max"
                inputmode="decimal"
                @input="maxAmount = ($event.target as HTMLInputElement).value"
              />
            </div>
          </div>

          <div v-if="hasActiveFilters" class="browse-filter-actions">
            <button type="button" class="btn btn-ghost browse-clear" @click="clearFilters">Clear filters</button>
          </div>
        </div>

        <p v-if="filteredTransactions.length" class="browse-summary">
          {{ filteredTransactions.length }} charge{{ filteredTransactions.length === 1 ? "" : "s" }}
          · {{ formatIls(filteredTotal) }}
        </p>

        <p v-if="!allTransactions.length" class="browse-empty">
          No transactions yet. Upload a statement from the menu.
        </p>
        <p v-else-if="!filteredTransactions.length" class="browse-empty">No charges match your filters.</p>
        <TransactionList
          v-else
          :transactions="filteredTransactions"
          title=""
          show-category
          :default-limit="100"
          :excludeable="!auth.isDemo"
          :excluding-key="excludingKey"
          @exclude="excludeTransaction"
        />
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { addExclusion, fetchReport } from "../api/client";
import AppLoader from "../components/AppLoader.vue";
import CategorySelect from "../components/CategorySelect.vue";
import ToggleSwitch from "../components/ToggleSwitch.vue";
import TransactionList from "../components/TransactionList.vue";
import { useAuthStore } from "../stores/auth";
import { useHomeDataStore } from "../stores/homeData";
import { confirm } from "../composables/useConfirm";
import type { MonthItem, Transaction } from "../types";
import { CATEGORY_PICKLIST, rollupCategory } from "../categories";
import { formatIls } from "../utils/format";
import { loadBrowseIncludeRecurring, saveBrowseIncludeRecurring } from "../utils/browsePreferences";
import { isSystemRecurringTransaction } from "../utils/householdBudget";
import { transactionKey } from "../utils/transactionKey";

type AmountPreset = { id: string; label: string; min: number | null; max: number | null };

const amountPresets: AmountPreset[] = [
  { id: "gt100", label: "Above ₪100", min: 100, max: null },
  { id: "gt200", label: "Above ₪200", min: 200, max: null },
  { id: "lt200", label: "Below ₪200", min: null, max: 200 },
  { id: "lt50", label: "Below ₪50", min: null, max: 50 },
];

const auth = useAuthStore();
const homeData = useHomeDataStore();
const loading = ref(true);
const error = ref("");
const months = ref<MonthItem[]>([]);
const allTransactions = ref<Transaction[]>([]);
const selectedMonth = ref("");
const searchQuery = ref("");
const categoryFilter = ref("");
const minAmount = ref("");
const maxAmount = ref("");
const excludingKey = ref<string | null>(null);
const includeRecurring = ref(loadBrowseIncludeRecurring());

watch(includeRecurring, (value) => {
  saveBrowseIncludeRecurring(value);
});

const categoryOptions = CATEGORY_PICKLIST;

const activePreset = computed(() => {
  const min = parseAmount(minAmount.value);
  const max = parseAmount(maxAmount.value);
  for (const chip of amountPresets) {
    if (chip.min === min && chip.max === max) return chip.id;
  }
  return "";
});

const hasActiveFilters = computed(
  () =>
    !!searchQuery.value.trim() ||
    !!selectedMonth.value ||
    !!categoryFilter.value ||
    !!minAmount.value ||
    !!maxAmount.value,
);

const filteredTransactions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const min = parseAmount(minAmount.value);
  const max = parseAmount(maxAmount.value);
  const cat = categoryFilter.value;

  return allTransactions.value.filter((tx) => {
    if (!includeRecurring.value && isSystemRecurringTransaction(tx)) return false;
    if (q) {
      const merchant = `${tx.merchant_en} ${tx.merchant_he}`.toLowerCase();
      if (!merchant.includes(q)) return false;
    }
    if (cat) {
      const rolled = rollupCategory(tx.category_en || "Uncategorized");
      if (rolled !== cat && (tx.category_en || "Uncategorized") !== cat) return false;
    }
    const amount = tx.charge_amount;
    if (min != null && amount < min) return false;
    if (max != null && amount > max) return false;
    return true;
  });
});

const filteredTotal = computed(() =>
  filteredTransactions.value.reduce((sum, tx) => sum + tx.charge_amount, 0),
);

function parseAmount(raw: string | number): number | null {
  if (raw === "" || raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function applyPreset(chip: AmountPreset) {
  if (activePreset.value === chip.id) {
    minAmount.value = "";
    maxAmount.value = "";
    return;
  }
  minAmount.value = chip.min != null ? String(chip.min) : "";
  maxAmount.value = chip.max != null ? String(chip.max) : "";
}

function clearFilters() {
  searchQuery.value = "";
  selectedMonth.value = "";
  categoryFilter.value = "";
  minAmount.value = "";
  maxAmount.value = "";
}

async function loadTransactions(options: { background?: boolean } = {}) {
  error.value = "";
  const month = selectedMonth.value || null;
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  const scoped = month ? homeData.peek(demo, token)?.scoped_reports?.[month] : null;

  if (scoped && !options.background) {
    allTransactions.value = [...scoped.transactions];
    void loadTransactions({ background: true });
    return;
  }

  try {
    const report = await fetchReport(demo, month, token);
    if (month === (selectedMonth.value || null)) {
      allTransactions.value = [...report.transactions];
    }
  } catch (e) {
    if (!options.background) {
      error.value = e instanceof Error ? e.message : "Could not load transactions";
      allTransactions.value = [];
    }
  }
}

function defaultBrowseMonthKey(months: MonthItem[]): string {
  const finals = months.filter((m) => !m.partial);
  if (finals.length) {
    return [...finals].sort((a, b) => b.billing_date.localeCompare(a.billing_date))[0].key;
  }
  return months[0]?.key ?? "";
}

async function load(options: { background?: boolean; force?: boolean } = {}) {
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  const cached = !options.force && !options.background && homeData.peek(demo, token);

  if (cached) {
    months.value = cached.months;
    if (!selectedMonth.value) selectedMonth.value = defaultBrowseMonthKey(cached.months);
    loading.value = false;
    await loadTransactions();
    void load({ background: true });
    return;
  }

  if (!options.background) loading.value = true;
  try {
    const bundle = await homeData.load(demo, token, options);
    months.value = bundle.months;
    if (!options.background) selectedMonth.value = defaultBrowseMonthKey(bundle.months);
    await loadTransactions({ background: options.background });
  } catch (e) {
    if (!options.background) error.value = e instanceof Error ? e.message : "Could not load data";
  } finally {
    if (!options.background) loading.value = false;
  }
}

async function excludeTransaction(tx: Transaction) {
  if (auth.isDemo) return;
  const label = `${formatIls(tx.charge_amount)} · ${tx.merchant_en || tx.merchant_he}`;
  const ok = await confirm({
    title: "Exclude transaction?",
    message: `Exclude ${label} from your totals?\n\nYou can restore it anytime from the Excluded tab.`,
    confirmLabel: "Exclude",
    tone: "danger",
  });
  if (!ok) return;
  const key = transactionKey(tx);
  excludingKey.value = key;
  try {
    await addExclusion({ transaction: tx, note: "Not my spend" }, auth.token || undefined);
    allTransactions.value = allTransactions.value.filter((t) => transactionKey(t) !== key);
  } catch (e) {
    window.alert(String(e));
  } finally {
    excludingKey.value = null;
  }
}

watch(selectedMonth, () => {
  if (loading.value) return;
  void loadTransactions();
});

onMounted(load);
</script>
