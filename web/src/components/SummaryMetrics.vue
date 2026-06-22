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
            <button ref="closeBtn" type="button" class="btn btn-ghost everyday-breakdown-close" @click="closeEverydayBreakdown">
              Close
            </button>
          </header>

          <div class="everyday-breakdown-body">
            <section class="everyday-breakdown-section">
              <p class="everyday-breakdown-section-title">How this total is built</p>
              <table class="everyday-breakdown-summary">
                <tbody>
                  <tr class="everyday-breakdown-summary-group">
                    <td colspan="2">From Visa partial export</td>
                  </tr>
                  <tr>
                    <td>Posted (final on statement)</td>
                    <td>{{ formatIls(everydayComposition.exportPosted) }}</td>
                  </tr>
                  <tr v-if="everydayComposition.exportPending > 0">
                    <td>
                      Pending (still processing)
                      <span class="everyday-breakdown-row-note">~estimated — may change on final bill</span>
                    </td>
                    <td>~{{ formatIls(everydayComposition.exportPending) }}</td>
                  </tr>
                  <tr class="everyday-breakdown-summary-sub">
                    <td>Export subtotal</td>
                    <td>{{ formatIls(everydayComposition.exportTotal) }}</td>
                  </tr>
                  <template v-if="everydayComposition.configuredTotal > 0">
                    <tr class="everyday-breakdown-summary-group">
                      <td colspan="2">
                        Added from
                        <RouterLink class="everyday-breakdown-link" to="/app/recurring">Extra charges</RouterLink>
                        (not on Visa export)
                      </td>
                    </tr>
                    <tr v-for="row in everydayComposition.configuredRows" :key="row.id">
                      <td>{{ row.label }}</td>
                      <td>{{ formatIls(row.amount) }}</td>
                    </tr>
                    <tr class="everyday-breakdown-summary-sub">
                      <td>Configured subtotal</td>
                      <td>{{ formatIls(everydayComposition.configuredTotal) }}</td>
                    </tr>
                  </template>
                  <tr class="everyday-breakdown-summary-total">
                    <td>Everyday total</td>
                    <td>{{ formatIls(everydayTotal) }}</td>
                  </tr>
                </tbody>
              </table>
              <p class="everyday-breakdown-formula">
                {{ formatIls(everydayComposition.exportTotal) }} export
                <template v-if="everydayComposition.configuredTotal > 0">
                  + {{ formatIls(everydayComposition.configuredTotal) }} configured
                </template>
                = {{ formatIls(everydayTotal) }}
              </p>
              <p v-if="everydayComposition.exportPending > 0" class="everyday-breakdown-section-hint">
                Inside the export: {{ formatIls(everydayComposition.exportPosted) }} posted + ~{{ formatIls(everydayComposition.exportPending) }} pending.
              </p>
            </section>

            <section v-if="showCardTotalSection" class="everyday-breakdown-section">
              <p class="everyday-breakdown-section-title">Card total ({{ formatIls(report.total_spent) }})</p>
              <p class="everyday-breakdown-section-hint">
                Rent, car loan, and Dev Institute count toward total spent but not everyday spending.
              </p>
              <table class="everyday-breakdown-summary">
                <tbody>
                  <tr>
                    <td>Everyday spending</td>
                    <td>{{ formatIls(everydayTotal) }}</td>
                  </tr>
                  <tr v-if="monthlyBillsBreakdown.rent > 0">
                    <td>Rent</td>
                    <td>{{ formatIls(monthlyBillsBreakdown.rent) }}</td>
                  </tr>
                  <tr v-if="monthlyBillsBreakdown.carLoan > 0">
                    <td>Car loan</td>
                    <td>{{ formatIls(monthlyBillsBreakdown.carLoan) }}</td>
                  </tr>
                  <tr v-if="monthlyBillsBreakdown.devInstitute > 0">
                    <td>Dev Institute</td>
                    <td>{{ formatIls(monthlyBillsBreakdown.devInstitute) }}</td>
                  </tr>
                  <tr class="everyday-breakdown-summary-total">
                    <td>Total on card</td>
                    <td>{{ formatIls(report.total_spent) }}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section v-if="pendingStatementCharges.length" class="everyday-breakdown-section">
              <p class="everyday-breakdown-section-title">
                Pending on export ({{ everydayComposition.exportPendingCount }})
              </p>
              <p class="everyday-breakdown-section-hint">
                These rows have no final ₪ amount from the bank yet — we estimate from the charge or FX rate.
              </p>
              <TransactionList
                class="everyday-breakdown-txs everyday-breakdown-txs--pending"
                :transactions="pendingStatementCharges"
                title=""
                :show-category="true"
                :statement-billing="billingPeriod"
                :default-limit="25"
              />
            </section>

            <section class="everyday-breakdown-section">
              <p class="everyday-breakdown-section-title">
                By category ({{ everydayChargeCount }} charge{{ everydayChargeCount === 1 ? "" : "s" }})
              </p>
              <p v-if="!everydayCategories.length" class="cost-breakdown-empty">No everyday charges in this snapshot.</p>
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
                    <span class="cost-breakdown-pct">{{ categoryPct(row.total) }}%</span>
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
  monthlyBillsBreakdown as getMonthlyBillsBreakdown,
  monthlyBillsTotal,
  moneyLeft,
  pendingStatementEverydayTransactions,
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
const everydayChargeCount = computed(() => everydayTransactions(props.report.transactions).length);
const pendingStatementCharges = computed(() => pendingStatementEverydayTransactions(props.report.transactions));
const monthlyBillsBreakdown = computed(() => getMonthlyBillsBreakdown(props.report.transactions));
const monthlyBills = computed(() => monthlyBillsTotal(props.report.transactions));
const showCardTotalSection = computed(
  () => monthlyBills.value > 0 || Math.abs(props.report.total_spent - everydayTotal.value) >= 0.02,
);
const everydayPct = computed(() =>
  props.report.total_spent ? Math.round((everydayTotal.value / props.report.total_spent) * 100) : 0,
);
const monthlyBillsPct = computed(() =>
  props.report.total_spent ? Math.round((monthlyBills.value / props.report.total_spent) * 100) : 0,
);

const everydayBreakdownEnabled = computed(() => props.partial && everydayTotal.value > 0);
const everydayCardTag = computed(() => (everydayBreakdownEnabled.value ? "button" : "div"));

function categoryPct(total: number): string {
  if (!everydayTotal.value) return "0";
  return String(Math.round((total / everydayTotal.value) * 100));
}

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
