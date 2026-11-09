<template>
  <div class="summary-metrics">
    <BudgetHero
      v-if="plan && !hideLivingBudget"
      :plan="plan"
      :everyday-enabled="everydayBreakdownEnabled"
      @everyday="openEverydayBreakdown"
    />
    <div v-if="!compact || !plan" class="metric-grid">
      <div v-if="!plan && !hideLivingBudget" class="metric-card metric-card-budget" :class="budgetClass">
        <template v-if="livingBudget !== null">
          <div v-if="dailyBudgetDisplay" class="metric-budget-top">
            <div class="metric-budget-main">
              <div class="metric-label">{{ budgetLabel }}</div>
              <div class="metric-value">{{ budgetDisplayValue }}</div>
            </div>
            <div class="metric-budget-daily">
              <div class="metric-budget-daily-value">{{ dailyBudgetDisplay.perDay }}</div>
              <div class="metric-budget-daily-meta">{{ dailyBudgetDisplay.meta }}</div>
            </div>
          </div>
          <template v-else>
            <div class="metric-label">{{ budgetLabel }}</div>
            <div class="metric-value">{{ budgetDisplayValue }}</div>
          </template>
          <div
            class="metric-budget-progress"
            role="progressbar"
            :aria-valuenow="budgetUsedPct"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="`${budgetUsedPct}% of the living budget used`"
          >
            <span class="metric-budget-progress__fill" :style="{ width: `${budgetUsedPct}%` }" />
          </div>
          <p class="metric-budget-formula">{{ budgetFormula }}</p>
          <ul class="metric-budget-breakdown">
            <li>
              <button
                v-if="compact && everydayBreakdownEnabled"
                type="button"
                class="metric-budget-breakdown__link"
                @click="openEverydayBreakdown"
              >
                Everyday ›
              </button>
              <span v-else>Everyday</span>
              <span>{{ formatIlsWhole(budgetEveryday) }}</span>
            </li>
            <li v-if="budgetRent > 0">
              <span>Flat rent</span>
              <span>{{ formatIlsWhole(budgetRent) }}</span>
            </li>
            <li v-if="budgetDevInstitute > 0">
              <span>Dev Institute</span>
              <span>{{ formatIlsWhole(budgetDevInstitute) }}</span>
            </li>
            <li v-if="budgetCarLoan > 0">
              <span>Car loan</span>
              <span>{{ formatIlsWhole(budgetCarLoan) }}</span>
            </li>
          </ul>
        </template>
        <template v-else>
          <div class="metric-label">Living budget</div>
          <div class="metric-value metric-value-sm">Not set for this month</div>
          <p class="metric-sub-note">
            Add budget periods for this billing cycle on
            <RouterLink class="metric-budget-edit-link" to="/app/household#living-budget">Household</RouterLink>.
          </p>
        </template>
        <div v-if="livingBudgetPeriodLabel" class="metric-budget-footer">
          <div class="metric-budget-footer__period">Budget period: {{ livingBudgetPeriodLabel }}</div>
          <RouterLink class="metric-budget-edit-link" to="/app/household#living-budget">Edit budget</RouterLink>
        </div>
      </div>
      <div v-if="!compact" class="metric-card">
        <div class="metric-label">Total spent</div>
        <div class="metric-value">{{ formatIlsWhole(report.total_spent) }}</div>
        <div class="metric-sub">{{ everydayPct }}% everyday · {{ monthlyBillsPct }}% bills</div>
      </div>
      <component
        :is="everydayCardTag"
        v-if="!compact"
        class="metric-card"
        :class="{ 'metric-card-clickable': everydayBreakdownEnabled, active: everydayBreakdownOpen }"
        :type="everydayBreakdownEnabled ? 'button' : undefined"
        :aria-expanded="everydayBreakdownEnabled ? everydayBreakdownOpen : undefined"
        @click="openEverydayBreakdown"
      >
        <div class="metric-label">Everyday spending</div>
        <div class="metric-value">{{ formatIlsWhole(everydayTotal) }}</div>
        <div class="metric-sub">{{ everydayPct }}% of total</div>
      </component>
      <div v-if="!compact" class="metric-card">
        <div class="metric-label">Monthly bills</div>
        <div class="metric-value">{{ formatIlsWhole(monthlyBills) }}</div>
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
import type { SpendingReport } from "@/shared/types";
import { formatAboutIls, formatIls, formatIlsWhole } from "@/shared/utils/format";
import {
  budgetSpendBreakdown,
  dailyBudgetLeft,
  everydaySpendingComposition,
  everydaySpendingTotal,
  monthlyBillsTotal,
  moneyLeft,
} from "@/features/household/utils/householdBudget";
import { budgetPlanToneClass, type BudgetPlan } from "@/features/spending/utils/budgetPlan";
import BudgetHero from "@/features/spending/components/BudgetHero.vue";
import { getBillingCycle } from "@/features/spending/utils/pace";

const props = withDefaults(
  defineProps<{
    report: SpendingReport;
    livingBudget: number | null;
    hideLivingBudget?: boolean;
    retrospective?: boolean;
    compact?: boolean;
    /** Live-cycle plan — drives the green / yellow / red card, the per-day figure and the bar marker. */
    plan?: BudgetPlan | null;
    cycleDay?: number;
    referenceDate?: Date;
    livingBudgetPeriodLabel?: string | null;
  }>(),
  {
    retrospective: false,
    compact: false,
    plan: null,
    hideLivingBudget: false,
    livingBudgetPeriodLabel: null,
  },
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
const budgetUsedPct = computed(() => {
  if (!props.livingBudget || props.livingBudget <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((budgetSpent.value / props.livingBudget) * 100)));
});
const isOverBudget = computed(() => budgetLeft.value !== null && budgetLeft.value < 0);
const overAmount = computed(() => Math.abs(budgetLeft.value ?? 0));

const budgetLabel = computed(() => {
  if (isOverBudget.value) return props.retrospective ? "Overspent" : "Over budget";
  if (props.retrospective) return "Under budget";
  return "Money left";
});

const budgetDisplayValue = computed(() => {
  if (budgetLeft.value === null) return "—";
  return isOverBudget.value ? formatIlsWhole(overAmount.value) : formatIlsWhole(budgetLeft.value);
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
  const perDayLabel = isOverBudget.value || perDay <= 0 ? "₪0/day" : `${formatIlsWhole(perDay)}/day`;
  return {
    perDay: perDayLabel,
    meta: `${daysLeftInCycle.value} days left`,
  };
});

const budgetFormula = computed(() => {
  if (props.livingBudget === null || budgetLeft.value === null) return "";
  const budget = formatIlsWhole(props.livingBudget);
  const spent = formatIlsWhole(budgetSpent.value);
  if (isOverBudget.value) {
    return `${budget} living budget − ${spent} used = ${formatIlsWhole(overAmount.value)} over`;
  }
  if (props.retrospective) {
    return `${budget} living budget − ${spent} used = ${formatIlsWhole(budgetLeft.value)} left`;
  }
  return `${budget} living budget − ${spent} used`;
});
const budgetClass = computed(() => {
  if (props.plan) return budgetPlanToneClass(props.plan.tone);
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
