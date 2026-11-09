<template>
  <div class="pace-card">
    <header class="pace-header">
      <div class="pace-header-title">
        <h3 class="pace-card-title">How am I doing?</h3>
        <p class="pace-card-sub">{{ formatCycleRange(cycleInfo.cycleStart, cycleInfo.cycleEnd) }}</p>
      </div>
      <div class="pace-progress-wrap">
        <div class="pace-progress-bar" role="progressbar" :aria-valuenow="cycleInfo.dayIndex" :aria-valuemax="cycleInfo.cycleLength">
          <div class="pace-progress-fill" :style="{ width: progressPct + '%' }" />
        </div>
        <span class="pace-progress-label">Day {{ cycleInfo.dayIndex }} of {{ cycleInfo.cycleLength }}</span>
      </div>
    </header>

    <div class="pace-layout">
      <section v-if="showEntryPanel" class="pace-panel pace-panel-entry pace-panel-wide">
        <div class="pace-entry-grid">
          <div class="pace-entry-main">
            <label v-if="!partialStatementActive" class="pace-manual-label" for="pace-manual-input">
              Everyday spending so far (₪)
            </label>
            <input
              v-if="!partialStatementActive"
              id="pace-manual-input"
              v-model="manualInput"
              class="input pace-manual-input"
              type="text"
              inputmode="decimal"
              placeholder="e.g. 2000"
              @blur="persistManual"
            />
            <p class="pace-manual-hint">
              <template v-if="partialStatementActive && pace && pace.statementSpend > 0">
                From partial statement: <strong>{{ formatIls(pace.statementSpend) }}</strong>
              </template>
              <template v-else-if="pace && pace.manualEverydaySpend !== null">
                Using your entry as total spending for this cycle.
              </template>
              <template v-else-if="pace && pace.statementSpend > 0">
                From statements: {{ formatIls(pace.statementSpend) }}
              </template>
              <template v-else>
                Enter your spending from the bank app for this cycle.
              </template>
            </p>
          </div>
        </div>
      </section>

      <section v-if="plan && (displaySpend > 0 || plan.flexSpent > 0)" class="pace-panel pace-panel-metrics">
        <div class="pace-simple">
          <div class="pace-verdict" :class="verdictToneClass">
            <p class="pace-verdict-status">{{ plan.status }}</p>
            <p class="pace-verdict-delta">{{ verdictLine }}</p>
            <p v-if="perDayLine" class="pace-budget-note">{{ perDayLine }}</p>
          </div>

          <details class="pace-simple-details">
            <summary>How this is worked out</summary>
            <p class="pace-simple-details-note">
              Your budget minus the fixed bills is spread evenly over the cycle. That daily
              amount never changes this cycle — only your buffer does.
            </p>
            <div class="pace-simple-table-wrap">
              <table class="pace-simple-table">
                <tbody>
                  <tr class="pace-simple-table-group">
                    <td colspan="2">The plan</td>
                  </tr>
                  <tr>
                    <td>Living budget</td>
                    <td>{{ formatIlsWhole(plan.budget) }}</td>
                  </tr>
                  <tr class="pace-simple-table-sub">
                    <td>− Rent, car loan, Dev Institute, vaad bayit{{ plan.vaadReserve > 0 ? " (reserved)" : "" }}</td>
                    <td>{{ formatIlsWhole(plan.bills) }}</td>
                  </tr>
                  <tr>
                    <td>= Flexible money</td>
                    <td>{{ formatIlsWhole(plan.flexBudget) }}</td>
                  </tr>
                  <tr>
                    <td>÷ {{ plan.cycleLength }} days</td>
                    <td>{{ formatIlsWhole(plan.planPerDay) }}/day</td>
                  </tr>
                  <tr class="pace-simple-table-group">
                    <td colspan="2">So far (day {{ plan.dayIndex }})</td>
                  </tr>
                  <tr>
                    <td>Plan through yesterday</td>
                    <td>{{ formatIlsWhole(plan.plannedSoFar) }}</td>
                  </tr>
                  <tr>
                    <td>Flexible spending</td>
                    <td>{{ formatIlsWhole(plan.flexSpent) }}</td>
                  </tr>
                  <tr class="pace-simple-table-gap" :class="plan.buffer >= 0 ? 'pace-delta-good' : 'pace-delta-bad'">
                    <td>Buffer</td>
                    <td>{{ formatSigned(plan.buffer) }}</td>
                  </tr>
                  <tr class="pace-simple-table-group">
                    <td colspan="2">Rest of the cycle</td>
                  </tr>
                  <tr>
                    <td>Flexible money left</td>
                    <td>{{ formatIlsWhole(plan.flexLeft) }}</td>
                  </tr>
                  <tr>
                    <td>÷ {{ plan.daysLeft }} days (incl. today)</td>
                    <td>{{ formatIlsWhole(plan.perDayLeft) }}/day</td>
                  </tr>
                  <template v-if="usualGap !== null">
                    <tr class="pace-simple-table-group">
                      <td colspan="2">For context — not used for the colour</td>
                    </tr>
                    <tr>
                      <td>Everyday vs your usual by day {{ plan.dayIndex }}</td>
                      <td>{{ formatSigned(-usualGap) }}</td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
            <p class="pace-simple-details-note">
              Green: you can keep spending {{ formatIlsWhole(plan.planPerDay) }}/day. Yellow: you need
              to trim a little (75–90% of that). Red: under 75%, or the budget is gone.
            </p>
          </details>
        </div>
      </section>

      <section v-else-if="displaySpend > 0" class="pace-panel pace-panel-metrics">
        <div class="pace-simple">
          <div class="pace-simple-fallback">
            <p class="pace-simple-fallback-value">{{ formatIls(displaySpend) }}</p>
            <p class="pace-simple-fallback-label">everyday spending so far</p>
            <p v-if="usualGap !== null" class="pace-simple-meta">{{ usualGapLine }}</p>
            <p class="pace-simple-meta pace-simple-meta-muted">
              Set a living budget on
              <RouterLink to="/app/household#living-budget">Household</RouterLink>
              to see whether you're on track.
            </p>
          </div>
        </div>
      </section>

      <p v-else-if="!showEntryPanel" class="pace-simple-meta pace-simple-meta-muted pace-panel-wide">
        Enter spending from your bank app, or upload a partial statement.
      </p>

      <p v-if="pace?.dataStale && !resolvedManualSpend" class="pace-warning pace-panel-wide">
        Upload your latest bill or enter current spending above — this cycle isn't on your statements yet.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Transaction } from "@/shared/types";
import { formatIls, formatIlsWhole } from "@/shared/utils/format";
import { budgetPlanBufferLabel, computeBudgetPlan, type BudgetPlan } from "@/features/spending/utils/budgetPlan";
import type { ConfiguredCharge } from "@/features/household/utils/fixedCharges";
import {
  billingCycleProgress,
  computePace,
  cycleStartForDate,
  effectiveManualCycleSpend,
  loadCycleDay,
  loadPaceAvgCycles,
  pruneStaleManualCycleSpend,
  saveManualCycleSpend,
} from "@/features/spending/utils/pace";

const props = defineProps<{
  transactions: Transaction[];
  /** Current cycle transactions for everyday breakdown (matches SummaryMetrics). */
  cycleTransactions?: Transaction[];
  latestBillingDate?: string | null;
  configuredCharges?: ConfiguredCharge[];
  partialStatementActive?: boolean;
  /** Everyday spending for the current cycle view — matches SummaryMetrics when set. */
  cycleEverydaySpend?: number | null;
  /** Server timestamp for the partial snapshot covering this cycle, if any. */
  statementSavedAt?: string | null;
  partialTotalSpend?: number | null;
  /** Pin demo pace to sample “today” (Jun 13 2026). */
  referenceDate?: Date;
  /** Billing cycle start day (default from settings). */
  cycleDay?: number;
  /** Selected billing cycle — when viewing a partial/past cycle, not today's cycle. */
  cycleStart?: string | null;
  /** Resolved living budget for this cycle (incl. Cibus + monthly injection). */
  livingBudget?: number | null;
  /** Same plan as the Money left card; computed here when not passed. */
  plan?: BudgetPlan | null;
}>();

const emit = defineEmits<{ "settings-change": [] }>();

const cycleDay = computed(() => props.cycleDay ?? loadCycleDay());
const avgCycles = ref(loadPaceAvgCycles());

const cycleInfo = computed(() => {
  const today = props.referenceDate ?? new Date();
  const start = props.cycleStart ?? cycleStartForDate(today, cycleDay.value);
  const progress = billingCycleProgress(start, cycleDay.value, today);
  return {
    dayIndex: progress.dayIndex,
    cycleLength: progress.cycleLength,
    cycleStart: progress.start,
    cycleEnd: progress.end,
  };
});

const progressPct = computed(() => {
  const { dayIndex, cycleLength } = cycleInfo.value;
  if (!cycleLength) return 0;
  return Math.round((dayIndex / cycleLength) * 100);
});

const cycleStart = computed(() => cycleInfo.value.cycleStart);
const manualInput = ref("");

const hasStatementSpend = computed(
  () => props.cycleEverydaySpend != null && props.cycleEverydaySpend > 0,
);

const effectiveManual = computed(() =>
  effectiveManualCycleSpend(cycleStart.value, {
    statementSavedAt: props.statementSavedAt,
    hasStatementSpend: hasStatementSpend.value,
  }),
);

function loadManualForCycle() {
  pruneStaleManualCycleSpend(cycleStart.value, {
    statementSavedAt: props.statementSavedAt,
    hasStatementSpend: hasStatementSpend.value,
  });
  const saved = effectiveManualCycleSpend(cycleStart.value, {
    statementSavedAt: props.statementSavedAt,
    hasStatementSpend: hasStatementSpend.value,
  });
  manualInput.value = saved !== null ? String(saved) : "";
}

loadManualForCycle();

const manualSpend = computed((): number | null => {
  const raw = String(manualInput.value ?? "").trim().replace(/,/g, "");
  if (!raw) return null;
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
});

const resolvedManualSpend = computed((): number | null => {
  if (props.partialStatementActive) return null;
  if (hasStatementSpend.value && effectiveManual.value === null) return null;
  return manualSpend.value;
});

const everydaySpendOverride = computed(() => {
  if (resolvedManualSpend.value !== null) return undefined;
  if (props.cycleEverydaySpend != null && props.cycleEverydaySpend > 0) {
    return props.cycleEverydaySpend;
  }
  return undefined;
});

const pace = computed(() =>
  computePace(props.transactions, {
    cycleDay: cycleDay.value,
    includeFixed: false,
    latestBillingDate: props.latestBillingDate ?? null,
    manualSpend: resolvedManualSpend.value,
    avgCycles: avgCycles.value,
    configuredCharges: props.configuredCharges ?? [],
    cycleTransactions: props.cycleTransactions ?? [],
    statementSpendOverride: everydaySpendOverride.value,
    statementVariableOverride: everydaySpendOverride.value,
    today: props.referenceDate,
    cycleStart: cycleStart.value,
  }),
);

const displaySpend = computed(() => {
  if (everydaySpendOverride.value != null) return everydaySpendOverride.value;
  return pace.value?.currentSpend ?? 0;
});

const showEntryPanel = computed(() => {
  if (props.partialStatementActive) return false;
  if (displaySpend.value > 0 && resolvedManualSpend.value === null) return false;
  return true;
});

const plan = computed((): BudgetPlan | null => {
  if (props.plan !== undefined) return props.plan;
  return computeBudgetPlan(props.cycleTransactions ?? [], props.livingBudget ?? null, {
    cycleStart: cycleStart.value,
    cycleDay: cycleDay.value,
    referenceDate: props.referenceDate ?? new Date(),
  });
});

const verdictToneClass = computed(() => `pace-verdict--${plan.value?.tone ?? "good"}`);

const verdictLine = computed(() => {
  const p = plan.value;
  if (!p) return "";
  if (p.moneyLeft < 0) return `${formatIlsWhole(Math.abs(p.moneyLeft))} over this cycle's budget`;
  return budgetPlanBufferLabel(p, formatIlsWhole);
});

const perDayLine = computed(() => {
  const p = plan.value;
  if (!p || p.daysLeft <= 0) return "";
  if (p.flexLeft <= 0) return "No flexible money left for the rest of the cycle.";
  const days = p.daysLeft === 1 ? "today" : `each of the next ${p.daysLeft} days`;
  return `You can spend ${formatIlsWhole(p.perDayLeft)} ${days} (plan: ${formatIlsWhole(p.planPerDay)}/day).`;
});

/** Everyday spend so far minus usual at this day — context only. */
const usualGap = computed((): number | null => {
  const p = pace.value;
  if (!p || p.historicalAvgAtDay <= 0) return null;
  return p.vsAvgDelta;
});

const usualGapLine = computed(() => {
  const gap = usualGap.value;
  if (gap === null) return "";
  if (Math.abs(gap) < 1) return "Same as usual by this day.";
  return gap > 0
    ? `${formatIlsWhole(gap)} more than usual by this day.`
    : `${formatIlsWhole(Math.abs(gap))} less than usual by this day.`;
});

function formatSigned(delta: number): string {
  if (Math.abs(delta) < 1) return "₪0";
  return delta > 0 ? `+${formatIlsWhole(delta)}` : `−${formatIlsWhole(Math.abs(delta))}`;
}

function formatCycleRange(start: string, end: string): string {
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${fmt(s)} – ${fmt(e)}`;
}

function persistManual() {
  saveManualCycleSpend(cycleStart.value, manualSpend.value);
  emit("settings-change");
}

watch(cycleStart, () => {
  if (document.activeElement?.id !== "pace-manual-input") {
    loadManualForCycle();
  }
});

watch(
  () => [props.statementSavedAt, props.cycleEverydaySpend] as const,
  () => {
    if (document.activeElement?.id !== "pace-manual-input") {
      loadManualForCycle();
    }
  },
);
</script>
