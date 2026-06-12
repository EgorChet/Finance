<template>
  <div v-if="loading">Loading…</div>
  <div v-else-if="error">{{ error }}</div>
  <template v-else-if="report">
    <div v-if="auth.isDemo" class="demo-banner">
      Demo mode — sample spending data. Sign in to see your real statements.
    </div>
    <h2 style="margin: 0 0 1rem">Spending overview</h2>
    <MonthPicker :model-value="selectedMonth" :months="months" @update:model-value="onMonthSelected" />
    <MonthlyTrendChart v-if="selectedMonth === null && summary.length > 1" :summary="summary" />
    <SummaryMetrics :report="report" @select-category="onCategory" />
    <p class="section-title">Where did the money go?</p>
    <div class="explorer-grid">
      <div>
        <CategoryPieChart :categories="report.by_category" :selected="app.selectedCategory" @select="onCategory" />
        <p v-if="app.selectedCategory && selectedCategoryStats" class="category-pie-note">
          Selected · {{ formatIls(selectedCategoryStats.total) }}
        </p>
      </div>
      <div>
        <CategoryLegend v-if="!app.selectedCategory" :categories="report.by_category" @select="onCategory" />
        <div v-else-if="selectedCategoryStats" class="category-drilldown">
          <div class="category-drilldown-header">
            <div>
              <h3 class="category-drilldown-title">{{ app.selectedCategory }}</h3>
              <p class="category-drilldown-total">{{ formatIls(selectedCategoryStats.total) }}</p>
              <p class="category-drilldown-meta">
                {{ selectedCategoryStats.sharePct }}% of total spending
                · {{ selectedCategoryStats.count.toLocaleString() }}
                {{ selectedCategoryStats.count === 1 ? "charge" : "charges" }}
                · {{ selectedCategoryStats.merchantCount.toLocaleString() }}
                {{ selectedCategoryStats.merchantCount === 1 ? "merchant" : "merchants" }}
              </p>
            </div>
            <button type="button" class="btn btn-ghost" @click="app.clearCategory()">← All categories</button>
          </div>
          <MerchantBarChart :transactions="filteredTxs" :category="app.selectedCategory" />
        </div>
      </div>
    </div>
    <ChargeGrid
      :transactions="filteredTxs"
      :title="
        app.selectedCategory && selectedCategoryStats
          ? `Recent charges · ${app.selectedCategory} · ${formatIls(selectedCategoryStats.total)}`
          : 'Recent charges'
      "
      :show-category="!app.selectedCategory"
      :category-filter="app.selectedCategory || undefined"
    />
    <details style="margin-top: 1.5rem">
      <summary>Search or fix a label</summary>
      <p v-if="auth.isDemo" style="color: var(--text-muted); font-size: 0.85rem; margin: 0.5rem 0 0">
        Demo mode — search only. Sign in to save label fixes.
      </p>
      <input v-model="search" class="input" placeholder="Merchant, category, amount…" style="margin-top: 0.5rem" />
      <table v-if="searchMerchants.length" class="rules" style="margin-top: 0.75rem">
        <thead>
          <tr>
            <th>Hebrew</th>
            <th>English</th>
            <th>Category</th>
            <th>Charges</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in searchMerchants" :key="row.hebrew">
            <td>{{ row.hebrew }}</td>
            <td>
              <input v-model="row.english" class="input" :readonly="auth.isDemo" />
            </td>
            <td>
              <input v-model="row.category" class="input" list="overview-spending-cats" :readonly="auth.isDemo" />
            </td>
            <td style="color: var(--text-muted); white-space: nowrap">{{ row.count }}</td>
            <td>
              <button
                class="btn btn-primary"
                style="white-space: nowrap"
                :disabled="auth.isDemo || row.saving"
                @click="saveLabel(row)"
              >
                {{ row.saving ? "Saving…" : "Save" }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="searchHint" style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.5rem">{{ searchHint }}</p>
      <datalist id="overview-spending-cats">
        <option v-for="c in categories" :key="c" :value="c" />
      </datalist>
    </details>
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { fetchMonths, fetchReport, saveRuleEntry } from "../api/client";
import CategoryLegend from "../components/CategoryLegend.vue";
import CategoryPieChart from "../components/CategoryPieChart.vue";
import ChargeGrid from "../components/ChargeGrid.vue";
import MerchantBarChart from "../components/MerchantBarChart.vue";
import MonthPicker from "../components/MonthPicker.vue";
import MonthlyTrendChart from "../components/MonthlyTrendChart.vue";
import SummaryMetrics from "../components/SummaryMetrics.vue";
import { useAppStore } from "../stores/app";
import { useAuthStore } from "../stores/auth";
import type { MonthItem, SpendingReport, Transaction } from "../types";
import { TOP_PIE_CATEGORIES, SPENDING_CATEGORIES } from "../categories";
import { formatIls, roundMoney } from "../utils/format";

const categories = SPENDING_CATEGORIES;

interface SearchMerchantRow {
  hebrew: string;
  english: string;
  category: string;
  count: number;
  saving: boolean;
}

const auth = useAuthStore();
const app = useAppStore();
const loading = ref(true);
const error = ref("");
const report = ref<SpendingReport | null>(null);
const months = ref<MonthItem[]>([]);
const summary = ref<{ month: string; total: number }[]>([]);
const selectedMonth = ref<string | null>(null);
const search = ref("");
const searchHint = ref("");
const searchMerchants = ref<SearchMerchantRow[]>([]);

const filteredTxs = computed((): Transaction[] => {
  if (!report.value) return [];
  if (!app.selectedCategory) return report.value.transactions;
  if (app.selectedCategory.startsWith("Other")) {
    const top = new Set(
      [...report.value.by_category]
        .sort((a, b) => b.total - a.total)
        .slice(0, TOP_PIE_CATEGORIES)
        .map((c) => c.category_en),
    );
    return report.value.transactions.filter((t) => !top.has(t.category_en));
  }
  return report.value.transactions.filter((t) => t.category_en === app.selectedCategory);
});

const selectedCategoryStats = computed(() => {
  if (!report.value || !app.selectedCategory) return null;
  const txs = filteredTxs.value;
  const isOther = app.selectedCategory.startsWith("Other");
  const summary = isOther
    ? null
    : report.value.by_category.find((c) => c.category_en === app.selectedCategory);
  const total = roundMoney(
    summary?.total ?? txs.reduce((sum, t) => sum + t.charge_amount, 0),
  );
  const sharePct = summary
    ? Math.round(summary.share_pct)
    : report.value.total_spent
      ? Math.round((total / report.value.total_spent) * 100)
      : 0;
  const merchantCount = new Set(txs.map((t) => t.merchant_en || t.merchant_he)).size;
  return {
    total,
    count: summary?.count ?? txs.length,
    sharePct,
    merchantCount,
  };
});

const searchResults = computed(() => {
  if (!report.value || !search.value.trim()) return [];
  const q = search.value.toLowerCase();
  return report.value.transactions
    .filter(
      (t) =>
        (t.merchant_en || "").toLowerCase().includes(q) ||
        t.merchant_he.includes(q) ||
        (t.category_en || "").toLowerCase().includes(q) ||
        String(t.charge_amount).includes(q),
    )
    .slice(0, 200);
});

watch(searchResults, (txs) => {
  searchHint.value = "";
  if (!txs.length) {
    searchMerchants.value = [];
    return;
  }
  const byHebrew = new Map<string, SearchMerchantRow>();
  for (const t of txs) {
    const existing = byHebrew.get(t.merchant_he);
    if (existing) {
      existing.count += 1;
      continue;
    }
    byHebrew.set(t.merchant_he, {
      hebrew: t.merchant_he,
      english: t.merchant_en || "",
      category: t.category_en || "",
      count: 1,
      saving: false,
    });
  }
  searchMerchants.value = [...byHebrew.values()].sort((a, b) => b.count - a.count);
});

async function saveLabel(row: SearchMerchantRow) {
  if (auth.isDemo) return;
  row.saving = true;
  searchHint.value = "";
  try {
    await saveRuleEntry(
      {
        hebrew: row.hebrew,
        english: row.english.trim(),
        category: row.category.trim() || undefined,
      },
      auth.token || undefined,
    );
    searchHint.value = `Saved "${row.hebrew}" — reanalyzing statements…`;
    await refreshReport();
    searchHint.value = `Saved "${row.english || row.hebrew}" → ${row.category || "Uncategorized"}. Refresh in ~30s for charts to update.`;
  } catch (e) {
    searchHint.value = String(e);
  } finally {
    row.saving = false;
  }
}

function onCategory(name: string) {
  app.selectedCategory = app.selectedCategory === name ? "" : name;
}

let reportRequestId = 0;

async function refreshReport(month: string | null = selectedMonth.value) {
  const reqId = ++reportRequestId;
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  try {
    const r = await fetchReport(demo, month, token);
    if (reqId !== reportRequestId) return;
    report.value = r;
    error.value = "";
  } catch (e) {
    if (reqId !== reportRequestId) return;
    error.value = String(e);
  }
}

async function onMonthSelected(month: string | null) {
  selectedMonth.value = month;
  app.clearCategory();
  await refreshReport(month);
}

async function loadMonths() {
  loading.value = true;
  error.value = "";
  try {
    const demo = auth.isDemo;
    const token = auth.token || undefined;
    const m = await fetchMonths(demo, token);
    months.value = m.months;
    summary.value = m.summary;
    const initial = m.months[0]?.key ?? null;
    selectedMonth.value = initial;
    await refreshReport(initial);
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(loadMonths);
</script>
