<template>
  <div class="summary-metrics">
    <BudgetHero
      v-if="plan && !hideLivingBudget"
      :plan="plan"
      :extras="budgetExtras"
      :everyday-enabled="everydayBreakdownEnabled"
      @everyday="openEverydayBreakdown"
    />

    <!-- A month without a live plan (finished, or no card data yet): one result card. -->
    <div v-else-if="!hideLivingBudget && livingBudget !== null" class="bh bh-result" :class="`bh--${resultTone}`">
      <div class="bh-top">
        <span class="bh-pill"><span class="bh-dot" />{{ t(resultStatus) }}</span>
        <span class="bh-day">
          {{ t("Budget") }} {{ formatIlsWhole(livingBudget - extrasTotal) }}<template v-if="extrasTotal > 0"> + {{ t("{amount} extra", { amount: formatIlsWhole(extrasTotal) }) }}</template>
        </span>
      </div>
      <p class="bh-label">{{ isOverBudget ? t("Over budget by") : retrospective ? t("Left at the end") : t("Left so far") }}</p>
      <p class="bh-value">{{ formatIlsWhole(isOverBudget ? overAmount : Math.max(0, budgetLeft ?? 0)) }}</p>
      <div class="bh-bar" role="progressbar" :aria-valuenow="budgetUsedPct" aria-valuemin="0" aria-valuemax="100">
        <span :style="{ width: `${budgetUsedPct}%` }" />
      </div>
      <p class="bh-sub">{{ t("{spent} of {total} used", { spent: formatIlsWhole(budgetSpent), total: formatIlsWhole(livingBudget) }) }}</p>
      <div class="bh-stats">
        <div>
          <button v-if="everydayBreakdownEnabled" type="button" class="bh-stat-link" @click="openEverydayBreakdown">{{ t("Everyday") }} ›</button>
          <span v-else>{{ t("Everyday") }}</span>
          <strong>{{ formatIlsWhole(everydayTotal) }}</strong>
        </div>
        <div>
          <span>{{ t("Bills & fixed") }}</span>
          <strong>{{ formatIlsWhole(fixedTotal) }}</strong>
        </div>
        <div>
          <span>{{ t("Charges") }}</span>
          <strong>{{ report.transaction_count.toLocaleString() }}</strong>
        </div>
      </div>
    </div>

    <p v-else-if="!hideLivingBudget" class="bx-empty-line sm-nobudget">
      {{ t("No budget for this month yet.") }}
      <RouterLink class="bh-link" to="/app/household#living-budget">{{ t("Set one ›") }}</RouterLink>
    </p>

    <!-- Under the live card (and for a whole period): where the money went. -->
    <div v-if="!compact && (plan || hideLivingBudget || livingBudget === null)" class="sm-strip">
      <div v-if="hideLivingBudget || livingBudget === null">
        <span>{{ t("Total") }}</span>
        <strong>{{ formatIlsWhole(everydayTotal + fixedTotal) }}</strong>
      </div>
      <component
        :is="everydayBreakdownEnabled ? 'button' : 'div'"
        :type="everydayBreakdownEnabled ? 'button' : undefined"
        class="sm-strip-cell"
        @click="openEverydayBreakdown"
      >
        <span>{{ t("Everyday") }}{{ everydayBreakdownEnabled ? " ›" : "" }}</span>
        <strong>{{ formatIlsWhole(everydayTotal) }}</strong>
        <small>{{ everydayPct }}%</small>
      </component>
      <div>
        <span>{{ t("Bills & fixed") }}</span>
        <strong>{{ formatIlsWhole(fixedTotal) }}</strong>
        <small>{{ fixedPct }}%</small>
      </div>
      <div v-if="!(hideLivingBudget || livingBudget === null)">
        <span>{{ t("Charges") }}</span>
        <strong>{{ report.transaction_count.toLocaleString() }}</strong>
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
              <h3 id="everyday-breakdown-title" class="everyday-breakdown-title">{{ t("Everyday spending") }}</h3>
              <p class="everyday-breakdown-meta">{{ formatIls(everydayTotal) }}</p>
              <p class="everyday-breakdown-hint">
                {{ t("Day-to-day spending: food, coffee, shopping, transfers. Bills, rent, loans, installments and one-time charges aren't counted here — the budget card counts it the same way.") }}
              </p>
            </div>
            <button
              ref="closeBtn"
              type="button"
              class="btn everyday-breakdown-close"
              :aria-label="t('Close')"
              @click="closeEverydayBreakdown"
            >
              {{ t("Close") }}
            </button>
          </header>

          <div class="everyday-breakdown-body">
            <section class="everyday-breakdown-section">
              <ul class="everyday-breakdown-simple">
                <li class="everyday-breakdown-simple-row everyday-breakdown-simple-row--total">
                  <span>{{ t("Everyday total") }}</span>
                  <strong>{{ formatIls(everydayTotal) }}</strong>
                </li>
              </ul>
              <p v-if="split.everydayPending > 0" class="everyday-breakdown-note">
                {{ t("~{amount} of it is still processing and may change when the bank finalises it.", { amount: formatIls(split.everydayPending) }) }}
              </p>
            </section>
            <section v-if="split.fixedRows.length" class="everyday-breakdown-section">
              <p class="everyday-breakdown-section-title">{{ t("Not counted as everyday") }}</p>
              <ul class="everyday-breakdown-simple">
                <li v-for="row in split.fixedRows" :key="row.label" class="everyday-breakdown-simple-row everyday-breakdown-simple-row--sub">
                  <span>{{ tr(row.label) }}</span>
                  <span>{{ formatIls(row.amount) }}</span>
                </li>
                <li class="everyday-breakdown-simple-row everyday-breakdown-simple-row--total">
                  <span>{{ t("Bills & fixed") }}</span>
                  <strong>{{ formatIls(fixedTotal) }}</strong>
                </li>
              </ul>
              <RouterLink class="everyday-breakdown-link" to="/app/household">{{ t("Edit bills and charges ›") }}</RouterLink>
            </section>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { t, tr } from "@/shared/i18n";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import type { SpendingReport } from "@/shared/types";
import { formatAboutIls, formatIls, formatIlsWhole, roundMoney } from "@/shared/utils/format";
import { budgetSpendBreakdown, moneyLeft } from "@/features/household/utils/householdBudget";
import { spendingSplit, type BudgetPlan } from "@/features/spending/utils/budgetPlan";
import BudgetHero from "@/features/spending/components/BudgetHero.vue";

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
    /** This month's extra money, each addition separately. */
    budgetExtras?: { extra: number; note?: string }[];
  }>(),
  {
    retrospective: false,
    compact: false,
    plan: null,
    hideLivingBudget: false,
    livingBudgetPeriodLabel: null,
    budgetExtras: () => [],
  },
);

const everydayBreakdownOpen = ref(false);
const closeBtn = ref<HTMLButtonElement | null>(null);

const budgetBreakdown = computed(() => budgetSpendBreakdown(props.report.transactions));
const budgetSpent = computed(() => budgetBreakdown.value.spent);
const budgetLeft = computed(() =>
  props.livingBudget !== null ? moneyLeft(props.report.transactions, props.livingBudget) : null,
);
const budgetUsedPct = computed(() => {
  if (!props.livingBudget || props.livingBudget <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((budgetSpent.value / props.livingBudget) * 100)));
});
const extrasTotal = computed(() => roundMoney(props.budgetExtras.reduce((s, e) => s + (Number(e.extra) || 0), 0)));
const isOverBudget = computed(() => budgetLeft.value !== null && budgetLeft.value < 0);
const overAmount = computed(() => Math.abs(budgetLeft.value ?? 0));

/** Finished month: green under budget, red over. A month still running without a plan: yellow when < 20% is left. */
const resultTone = computed(() => {
  if (isOverBudget.value) return "bad";
  if (!props.retrospective && props.livingBudget && (budgetLeft.value ?? 0) <= props.livingBudget * 0.2) return "warn";
  return "good";
});
const resultStatus = computed(() => {
  if (isOverBudget.value) return props.retrospective ? "Finished over budget" : "Over budget";
  return props.retrospective ? "Finished within budget" : "In progress";
});

/** Same split as the budget card: day-to-day vs bills & fixed charges. */
const split = computed(() => spendingSplit(props.report.transactions, props.plan?.cycleStart));
/** On the open cycle the card's own number (it includes a hand-typed total); otherwise the split. */
const everydayTotal = computed(() => (props.plan ? props.plan.flexSpent : split.value.everyday));
const fixedTotal = computed(() =>
  props.plan ? roundMoney(Math.max(0, props.plan.spentOnCap - props.plan.flexSpent)) : split.value.fixed,
);
const everydayPct = computed(() => {
  const total = everydayTotal.value + fixedTotal.value;
  return total > 0 ? Math.round((everydayTotal.value / total) * 100) : 0;
});
const fixedPct = computed(() => (everydayTotal.value + fixedTotal.value > 0 ? 100 - everydayPct.value : 0));

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
