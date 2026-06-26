<template>
  <div class="summary-metrics">
    <div class="metric-grid">
      <div class="metric-card metric-card-budget" :class="budgetClass">
        <template v-if="livingBudget !== null">
          <div v-if="dailyBudgetDisplay" class="metric-budget-top">
            <div class="metric-budget-main">
              <div class="metric-label">{{ budgetLabel }}</div>
              <div class="metric-value">{{ budgetDisplayValue }}</div>
            </div>
            <div class="metric-budget-daily">
              <div class="metric-budget-daily-value">{{ dailyBudgetDisplay.perDay }}</div>
              <div class="metric-budget-daily-meta">{{ dailyBudgetDisplay.daysLeft }} days left</div>
            </div>
          </div>
          <template v-else>
            <div class="metric-label">{{ budgetLabel }}</div>
            <div class="metric-value">{{ budgetDisplayValue }}</div>
          </template>
          <p class="metric-budget-formula">{{ budgetFormula }}</p>
          <ul class="metric-budget-breakdown">
            <li>
              <span>Everyday</span>
              <span>{{ formatIls(budgetEveryday) }}</span>
            </li>
            <li v-if="budgetRent > 0">
              <span>Flat rent</span>
              <span>{{ formatIls(budgetRent) }}</span>
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
            Includes flat rent in the cap (not in everyday pace). Use a monthly extra if you need headroom for rent.
            <RouterLink class="metric-budget-edit-link" to="/app/household#living-budget">Edit budget</RouterLink>
          </p>
        </template>
        <template v-else>
          <div class="metric-label">Living budget</div>
          <div class="metric-value metric-value-sm">Not set for this month</div>
          <p class="metric-sub-note">
            Add budget periods for this billing cycle on
            <RouterLink class="metric-budget-edit-link" to="/app/household#living-budget">Household</RouterLink>.
          </p>
        </template>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total spent</div>
        <div class="metric-value">{{ formatIls(report.total_spent) }}</div>
        <div class="metric-sub">{{ everydayPct }}% everyday · {{ monthlyBillsPct }}% bills</div>
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
        <div class="metric-sub">{{ everydayPct }}% of total</div>
      </component>
      <div v-if="!compact" class="metric-card">
        <div class="metric-label">Monthly bills</div>
        <div class="metric-value">{{ formatIls(monthlyBills) }}</div>
        <div class="metric-sub">{{ monthlyBillsPct }}% · rent, car loan, Dev Institute</div>
      </div>
      <div v-if="!compact" class="metric-card">
        <div class="metric-label">Transactions</div>
        <div class="metric-value">{{ report.transaction_count.toLocaleString() }}</div>
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
                      Fixed bills
                      <RouterLink class="everyday-breakdown-link" to="/app/household">edit</RouterLink>
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
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import type { SpendingReport } from "../types";
import { formatAboutIls, formatIls } from "../utils/format";
import {
  budgetSpendBreakdown,
  dailyBudgetLeft,
  everydaySpendingComposition,
  everydaySpendingTotal,
  monthlyBillsTotal,
  moneyLeft,
} from "../utils/householdBudget";
import { paceHealthBudgetClass } from "../utils/paceBudget";
import type { PaceHealthTone } from "../utils/paceHealth";
import { getBillingCycle } from "../utils/pace";

const props = withDefaults(
  defineProps<{
    report: SpendingReport;
    livingBudget: number | null;
    retrospective?: boolean;
    compact?: boolean;
    /** Live-cycle pace tone — green / yellow / red money-left card. */
    paceTone?: PaceHealthTone | null;
    /** When true, use pace tone instead of raw budget-left coloring. */
    paceColored?: boolean;
    cycleDay?: number;
    referenceDate?: Date;
  }>(),
  { retrospective: false, compact: false, paceTone: null, paceColored: false },
);

const everydayBreakdownOpen = ref(false);
const closeBtn = ref<HTMLButtonElement | null>(null);

const budgetBreakdown = computed(() => budgetSpendBreakdown(props.report.transactions));
const budgetSpent = computed(() => budgetBreakdown.value.spent);
const budgetEveryday = computed(() => budgetBreakdown.value.everyday);
const budgetRent = computed(() => budgetBreakdown.value.rent);
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

const daysLeftInCycle = computed(() => {
  if (props.retrospective || props.cycleDay == null || props.referenceDate == null) return null;
  const { dayIndex, cycleLength } = getBillingCycle(props.referenceDate, props.cycleDay);
  return cycleLength - dayIndex + 1;
});

const dailyBudgetDisplay = computed(() => {
  if (budgetLeft.value === null || daysLeftInCycle.value === null || daysLeftInCycle.value <= 0) {
    return null;
  }
  const perDay = dailyBudgetLeft(
    budgetLeft.value,
    props.report.transactions,
    daysLeftInCycle.value,
  );
  if (perDay === null) return null;
  const perDayLabel = isOverBudget.value || perDay <= 0 ? "₪0/day" : `~${formatAboutIls(perDay)}/day`;
  return {
    perDay: perDayLabel,
    daysLeft: daysLeftInCycle.value,
  };
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
  if (props.paceColored) {
    return props.paceTone ? paceHealthBudgetClass(props.paceTone) : "";
  }
  if (props.livingBudget === null || budgetLeft.value === null) return "";
  if (budgetLeft.value < 0) return "metric-card-budget--over";
  if (budgetLeft.value <= props.livingBudget * 0.2) return "metric-card-budget--low";
  return "metric-card-budget--ok";
});

const everydayTotal = computed(() => everydaySpendingTotal(props.report.transactions));
const everydayComposition = computed(() => everydaySpendingComposition(props.report.transactions));
const monthlyBills = computed(() => monthlyBillsTotal(props.report.transactions));
const everydayPct = computed(() =>
  props.report.total_spent ? Math.round((everydayTotal.value / props.report.total_spent) * 100) : 0,
);
const monthlyBillsPct = computed(() =>
  props.report.total_spent ? Math.round((monthlyBills.value / props.report.total_spent) * 100) : 0,
);

const everydayBreakdownEnabled = computed(() => everydayTotal.value > 0);
const everydayCardTag = computed(() => (everydayBreakdownEnabled.value ? "button" : "div"));

function openEverydayBreakdown() {
  if (!everydayBreakdownEnabled.value) return;
  everydayBreakdownOpen.value = true;
}

function closeEverydayBreakdown() {
  everydayBreakdownOpen.value = false;
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
