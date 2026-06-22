<template>
  <div class="summary-metrics">
    <div class="metric-grid">
      <div class="metric-card metric-card-budget" :class="budgetClass">
        <template v-if="livingBudget !== null">
          <div class="metric-label">{{ budgetLabel }}</div>
          <div class="metric-value">{{ budgetDisplayValue }}</div>
          <p class="metric-budget-formula">{{ budgetFormula }}</p>
          <ul class="metric-budget-breakdown">
            <li>
              <span>Everyday</span>
              <span>{{ formatIls(budgetEveryday) }}</span>
            </li>
            <li v-if="budgetDevInstitute > 0">
              <span>Dev Institute</span>
              <span>{{ formatIls(budgetDevInstitute) }}</span>
            </li>
            <li v-if="budgetCarLoan > 0">
              <span>Car loan</span>
              <span>{{ formatIls(budgetCarLoan) }}</span>
            </li>
          </ul>
          <p class="metric-sub-note">
            Rent is not counted — paid outside this {{ formatIls(livingBudget) }} cap.
            <RouterLink class="metric-budget-edit-link" to="/app/recurring#living-budget">Edit budget</RouterLink>
          </p>
        </template>
        <template v-else>
          <div class="metric-label">Living budget</div>
          <div class="metric-value metric-value-sm">Not set for this month</div>
          <p class="metric-sub-note">
            Add budget periods for this billing cycle on
            <RouterLink class="metric-budget-edit-link" to="/app/recurring#living-budget">Extra charges</RouterLink>.
          </p>
        </template>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total spent</div>
        <div class="metric-value">{{ formatIls(report.total_spent) }}</div>
      </div>
      <component
        :is="everydayCardTag"
        class="metric-card"
        :class="{ 'metric-card-clickable': everydayBreakdownEnabled, active: everydayBreakdownOpen }"
        :type="everydayBreakdownEnabled ? 'button' : undefined"
        :aria-expanded="everydayBreakdownEnabled ? everydayBreakdownOpen : undefined"
        @click="openEverydayBreakdown"
      >
        <div class="metric-label">Everyday spending</div>
        <div class="metric-value">{{ formatIls(everydayTotal) }}</div>
        <div class="metric-sub">
          {{ everydayPct }}% of card total
          <span v-if="everydayBreakdownEnabled && everydaySettlement.pending > 0" class="metric-sub-pending">
            · {{ formatIls(everydaySettlement.pending) }} pending
          </span>
        </div>
        <span v-if="everydayBreakdownEnabled" class="metric-breakdown-cta">View breakdown →</span>
      </component>
      <div class="metric-card">
        <div class="metric-label">Monthly bills</div>
        <div class="metric-value">{{ formatIls(monthlyBills) }}</div>
        <div class="metric-sub">{{ monthlyBillsPct }}% · rent, car loan, Dev Institute</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Transactions</div>
        <div class="metric-value">{{ report.transaction_count.toLocaleString() }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Billing</div>
        <div class="metric-value metric-value-sm">
          {{ billingPeriod || "—" }}
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Statements</div>
        <div class="metric-value metric-value-sm">
          {{ (report.metadata.statement_count as number) || 1 }} month(s)
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="everydayBreakdownOpen"
        class="confirm-overlay everyday-breakdown-overlay"
        @click.self="closeEverydayBreakdown"
      >
        <div
          class="everyday-breakdown-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="everyday-breakdown-title"
        >
          <header class="everyday-breakdown-header">
            <div>
              <h3 id="everyday-breakdown-title" class="everyday-breakdown-title">Everyday spending</h3>
              <p class="everyday-breakdown-meta">{{ formatIls(everydayTotal) }}</p>
              <p class="everyday-breakdown-hint">
                Everything on the card except rent, car loan, and Dev Institute.
              </p>
            </div>
            <button
              ref="closeBtn"
              type="button"
              class="btn everyday-breakdown-close"
              aria-label="Close everyday spending breakdown"
              @click="closeEverydayBreakdown"
            >
              Close
            </button>
          </header>

          <div class="everyday-breakdown-body">
            <section class="everyday-breakdown-section">
              <p class="everyday-breakdown-section-title">Where this comes from</p>
              <ul class="everyday-breakdown-simple">
                <li class="everyday-breakdown-simple-row">
                  <span>On your Visa export</span>
                  <strong>{{ formatIls(everydayComposition.exportTotal) }}</strong>
                </li>
                <template v-if="everydayComposition.configuredTotal > 0">
                  <li class="everyday-breakdown-simple-row">
                    <span>
                      Extra charges
                      <RouterLink class="everyday-breakdown-link" to="/app/recurring">edit</RouterLink>
                    </span>
                    <strong>{{ formatIls(everydayComposition.configuredTotal) }}</strong>
                  </li>
                  <li
                    v-for="row in everydayComposition.configuredRows"
                    :key="row.id"
                    class="everyday-breakdown-simple-row everyday-breakdown-simple-row--sub"
                  >
                    <span>{{ row.label }}</span>
                    <span>{{ formatIls(row.amount) }}</span>
                  </li>
                </template>
                <li class="everyday-breakdown-simple-row everyday-breakdown-simple-row--total">
                  <span>Everyday total</span>
                  <strong>{{ formatIls(everydayTotal) }}</strong>
                </li>
              </ul>
              <p v-if="everydayComposition.exportPending > 0" class="everyday-breakdown-note">
                ~{{ formatIls(everydayComposition.exportPending) }} on the export is still processing and may change when the bank finalises it.
              </p>
            </section>

            <section class="everyday-breakdown-section">
              <p class="everyday-breakdown-section-title">By category</p>
              <p v-if="!everydayCategories.length" class="cost-breakdown-empty">No charges in this snapshot yet.</p>
              <template v-else>
              <div
                v-for="row in everydayCategories"
                :key="row.category_en"
                class="everyday-breakdown-category"
                :class="{ 'everyday-breakdown-category--open': expandedCategory === row.category_en }"
              >
                <button
                  type="button"
                  class="cost-breakdown-row"
                  :aria-expanded="expandedCategory === row.category_en"
                  @click="toggleCategory(row.category_en)"
                >
                  <span>{{ row.category_en }}</span>
                  <span class="cost-breakdown-amount">
                    {{ formatIls(row.total) }}
                    <span class="category-accordion-chevron" aria-hidden="true">
                      {{ expandedCategory === row.category_en ? "▾" : "▸" }}
                    </span>
                  </span>
                </button>
                <TransactionList
                  v-if="expandedCategory === row.category_en"
                  class="everyday-breakdown-txs"
                  :transactions="transactionsForCategory(row.category_en)"
                  title="Charges"
                  :show-category="false"
                  :statement-billing="billingPeriod"
                  :default-limit="25"
                />
              </div>
            </template>
            </section>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import TransactionList from "./TransactionList.vue";
import type { SpendingReport } from "../types";
import { rollupCategory } from "../categories";
import { formatBillingPeriod, formatIls } from "../utils/format";
import {
  budgetSpendBreakdown,
  everydaySpendingByCategory,
  everydaySpendingComposition,
  everydaySpendingSettlement,
  everydaySpendingTotal,
  everydayTransactions,
  monthlyBillsTotal,
  moneyLeft,
} from "../utils/householdBudget";

const props = withDefaults(
  defineProps<{ report: SpendingReport; livingBudget: number | null; retrospective?: boolean; partial?: boolean }>(),
  { retrospective: false, partial: false },
);

const everydayBreakdownOpen = ref(false);
const expandedCategory = ref<string | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);

const billingPeriod = computed(() => formatBillingPeriod(props.report.metadata));

const budgetBreakdown = computed(() => budgetSpendBreakdown(props.report.transactions));
const budgetSpent = computed(() => budgetBreakdown.value.spent);
const budgetEveryday = computed(() => budgetBreakdown.value.everyday);
const budgetDevInstitute = computed(() => budgetBreakdown.value.devInstitute);
const budgetCarLoan = computed(() => budgetBreakdown.value.carLoan);
const budgetLeft = computed(() =>
  props.livingBudget !== null ? moneyLeft(props.report.transactions, props.livingBudget) : null,
);
const isOverBudget = computed(() => budgetLeft.value !== null && budgetLeft.value < 0);
const overAmount = computed(() => Math.abs(budgetLeft.value ?? 0));

const budgetLabel = computed(() => {
  if (isOverBudget.value) return props.retrospective ? "Overspent" : "Over budget";
  if (props.retrospective) return "Under budget";
  return "Money left";
});

const budgetDisplayValue = computed(() => {
  if (budgetLeft.value === null) return "—";
  return isOverBudget.value ? formatIls(overAmount.value) : formatIls(budgetLeft.value);
});

const budgetFormula = computed(() => {
  if (props.livingBudget === null || budgetLeft.value === null) return "";
  const budget = formatIls(props.livingBudget);
  const spent = formatIls(budgetSpent.value);
  if (isOverBudget.value) {
    return `${budget} living budget − ${spent} used = ${formatIls(overAmount.value)} over`;
  }
  if (props.retrospective) {
    return `${budget} living budget − ${spent} used = ${formatIls(budgetLeft.value)} left`;
  }
  return `${budget} living budget − ${spent} used`;
});
const budgetClass = computed(() => {
  if (props.livingBudget === null || budgetLeft.value === null) return "";
  if (budgetLeft.value < 0) return "metric-card-budget--over";
  if (budgetLeft.value <= props.livingBudget * 0.2) return "metric-card-budget--low";
  return "metric-card-budget--ok";
});

const everydayTotal = computed(() => everydaySpendingTotal(props.report.transactions));
const everydayComposition = computed(() => everydaySpendingComposition(props.report.transactions));
const everydaySettlement = computed(() => everydaySpendingSettlement(props.report.transactions));
const everydayCategories = computed(() => everydaySpendingByCategory(props.report.transactions));
const monthlyBills = computed(() => monthlyBillsTotal(props.report.transactions));
const everydayPct = computed(() =>
  props.report.total_spent ? Math.round((everydayTotal.value / props.report.total_spent) * 100) : 0,
);
const monthlyBillsPct = computed(() =>
  props.report.total_spent ? Math.round((monthlyBills.value / props.report.total_spent) * 100) : 0,
);

const everydayBreakdownEnabled = computed(() => props.partial && everydayTotal.value > 0);
const everydayCardTag = computed(() => (everydayBreakdownEnabled.value ? "button" : "div"));

function transactionsForCategory(category: string) {
  return everydayTransactions(props.report.transactions).filter(
    (tx) => rollupCategory(tx.category_en?.trim() || "Uncategorized") === category,
  );
}

function openEverydayBreakdown() {
  if (!everydayBreakdownEnabled.value) return;
  expandedCategory.value = null;
  everydayBreakdownOpen.value = true;
}

function closeEverydayBreakdown() {
  everydayBreakdownOpen.value = false;
  expandedCategory.value = null;
}

function toggleCategory(category: string) {
  expandedCategory.value = expandedCategory.value === category ? null : category;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") closeEverydayBreakdown();
}

watch(everydayBreakdownOpen, (open) => {
  document.body.style.overflow = open ? "hidden" : "";
  if (open) {
    document.addEventListener("keydown", onKeydown);
    void nextTick(() => closeBtn.value?.focus());
  } else {
    document.removeEventListener("keydown", onKeydown);
  }
});

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  if (everydayBreakdownOpen.value) document.body.style.overflow = "";
});
</script>
