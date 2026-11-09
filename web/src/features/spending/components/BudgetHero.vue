<template>
  <div
    class="bh"
    :class="`bh--${plan.tone}`"
    role="button"
    tabindex="0"
    :aria-label="`${plan.status}. ${headline}. Open details`"
    @click="sheetOpen = true"
    @keydown.enter.prevent="sheetOpen = true"
    @keydown.space.prevent="sheetOpen = true"
  >
    <div class="bh-top">
      <span class="bh-pill"><span class="bh-dot" />{{ plan.status }}</span>
      <span class="bh-day">Day {{ plan.dayIndex }} of {{ plan.cycleLength }}</span>
    </div>

    <template v-if="plan.moneyLeft >= 0 && plan.daysLeft > 0">
      <p class="bh-label">You can spend</p>
      <p class="bh-value">{{ whole(plan.perDayLeft) }}<span class="bh-unit">/day</span></p>
    </template>
    <template v-else-if="plan.moneyLeft < 0">
      <p class="bh-label">Over budget by</p>
      <p class="bh-value">{{ whole(-plan.moneyLeft) }}</p>
    </template>
    <template v-else>
      <p class="bh-label">Left at the end</p>
      <p class="bh-value">{{ whole(plan.moneyLeft) }}</p>
    </template>
    <p class="bh-sub">{{ subline }}</p>

    <svg class="bh-chart" viewBox="0 0 300 84" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity="0.35" />
          <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path :d="planPath" class="bh-chart-plan" />
      <path v-if="actualArea" :d="actualArea" :fill="`url(#${gradId})`" />
      <path v-if="actualPath" :d="actualPath" class="bh-chart-actual" />
      <circle v-if="todayPoint" :cx="todayPoint.x" :cy="todayPoint.y" r="3.5" class="bh-chart-dot" />
    </svg>
    <div class="bh-legend" aria-hidden="true">
      <span><i class="bh-key bh-key--actual" />You</span>
      <span><i class="bh-key bh-key--plan" />Your usual pace</span>
    </div>

    <div class="bh-stats">
      <div>
        <span>Left</span>
        <strong>{{ whole(Math.max(0, plan.moneyLeft)) }}</strong>
      </div>
      <div>
        <span>Spent</span>
        <strong>{{ whole(plan.spentOnCap) }}</strong>
      </div>
      <div>
        <span>Budget</span>
        <strong>{{ whole(plan.budget) }}</strong>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="sheetOpen" class="confirm-overlay bh-overlay" @click.self="sheetOpen = false">
      <div class="everyday-breakdown-dialog bh-sheet" role="dialog" aria-modal="true" aria-labelledby="bh-sheet-title">
        <header class="bh-sheet-head">
          <h3 id="bh-sheet-title">{{ plan.status }}</h3>
          <button ref="closeBtn" type="button" class="btn bh-sheet-close" @click="sheetOpen = false">Done</button>
        </header>
        <p class="bh-sheet-lead">{{ explanation }}</p>

        <ul class="bh-rows">
          <li><span>Budget this cycle</span><strong>{{ whole(plan.budget) }}</strong></li>
          <li v-for="bill in billRows" :key="bill.label" class="bh-rows-sub">
            <span>− {{ bill.label }}</span><span>{{ whole(bill.amount) }}</span>
          </li>
          <li class="bh-rows-total"><span>Left for everyday</span><strong>{{ whole(plan.flexBudget) }}</strong></li>
        </ul>

        <ul class="bh-rows">
          <li><span>Usually spent by now</span><strong>{{ whole(plan.plannedSoFar) }}</strong></li>
          <li>
            <button v-if="everydayEnabled" type="button" class="bh-link" @click="openEveryday">You've spent ›</button>
            <span v-else>You've spent</span>
            <strong>{{ whole(plan.flexSpent) }}</strong>
          </li>
          <li class="bh-rows-total" :class="plan.buffer >= 0 ? 'bh-good' : 'bh-bad'">
            <span>{{ plan.buffer >= 0 ? "Under plan" : "Over plan" }}</span>
            <strong>{{ whole(Math.abs(plan.buffer)) }}</strong>
          </li>
        </ul>

        <ul v-if="plan.daysLeft > 0" class="bh-rows">
          <li><span>Left for {{ plan.daysLeft }} {{ plan.daysLeft === 1 ? "day" : "days" }}</span><strong>{{ whole(Math.max(0, plan.flexLeft)) }}</strong></li>
          <li><span>You can spend</span><strong>{{ whole(plan.perDayLeft) }}/day</strong></li>
          <li><span>You usually spend</span><strong>{{ whole(plan.planPerDayAhead) }}/day</strong></li>
        </ul>

        <p class="bh-sheet-note">
          {{ curveNote }} Green: at least 90% of what you usually need is left. Yellow: 75–90%. Red: less.
        </p>
        <RouterLink class="bh-link" to="/app/household#living-budget" @click="sheetOpen = false">Edit budget ›</RouterLink>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import type { BudgetPlan } from "@/features/spending/utils/budgetPlan";
import { formatIlsWhole } from "@/shared/utils/format";

const props = defineProps<{
  plan: BudgetPlan;
  everydayEnabled?: boolean;
}>();

const emit = defineEmits<{ everyday: [] }>();

const sheetOpen = ref(false);
const closeBtn = ref<HTMLButtonElement | null>(null);
const gradId = `bh-grad-${Math.random().toString(36).slice(2, 8)}`;

const whole = (n: number) => formatIlsWhole(n);

const headline = computed(() =>
  props.plan.daysLeft > 0 ? `You can spend ${whole(props.plan.perDayLeft)} per day` : "",
);

const subline = computed(() => {
  const p = props.plan;
  if (p.moneyLeft < 0) return `Budget was ${whole(p.budget)}`;
  if (p.daysLeft === 0) return `of ${whole(p.budget)}`;
  const days = `${p.daysLeft} ${p.daysLeft === 1 ? "day" : "days"} left`;
  if (Math.abs(p.buffer) < 1) return `Right on plan · ${days}`;
  return `${whole(Math.abs(p.buffer))} ${p.buffer > 0 ? "under" : "over"} plan · ${days}`;
});

const billRows = computed(() =>
  props.plan.committedRows.map((r) => ({
    label: r.kind === "vaad" && props.plan.vaadReserve > 0 ? `${r.label} (set aside)` : r.label,
    amount: r.amount,
  })),
);

const explanation = computed(() => {
  const p = props.plan;
  if (p.moneyLeft < 0) return `You've spent ${whole(-p.moneyLeft)} more than this cycle's budget.`;
  if (p.daysLeft === 0) return `The cycle is over with ${whole(p.moneyLeft)} left.`;
  if (p.tone === "good") {
    return `Keep spending like you usually do. You have ${whole(p.perDayLeft)} a day; you usually need ${whole(p.planPerDayAhead)}.`;
  }
  return `To finish within budget, keep to ${whole(p.perDayLeft)} a day — you usually spend ${whole(p.planPerDayAhead)}.`;
});

const curveNote = computed(() =>
  props.plan.curve.learned
    ? `"Usual" follows how you spent across your last ${props.plan.curve.cyclesUsed} cycles, scaled to this month's budget.`
    : `"Usual" spreads the flexible money evenly until there are 3 past cycles to learn from.`,
);

// ── Chart ──
const W = 300;
const H = 84;
const PAD = 4;
const maxY = computed(() =>
  Math.max(1, props.plan.flexBudget, ...props.plan.actualByDay) * 1.06,
);
const x = (day: number) => (day / props.plan.cycleLength) * W;
const y = (v: number) => H - PAD - (v / maxY.value) * (H - PAD * 2);

const planPath = computed(() => {
  const pts = [`M0,${y(0).toFixed(1)}`];
  props.plan.planByDay.forEach((v, i) => pts.push(`L${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`));
  return pts.join(" ");
});

const actualPoints = computed(() => {
  const a = props.plan.actualByDay;
  if (!a.length) return [];
  return [{ x: 0, y: y(0) }, ...a.map((v, i) => ({ x: x(i + 1), y: y(v) }))];
});

const actualPath = computed(() =>
  actualPoints.value.length ? actualPoints.value.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") : "",
);

const actualArea = computed(() => {
  const pts = actualPoints.value;
  if (!pts.length) return "";
  const last = pts[pts.length - 1];
  return `${actualPath.value} L${last.x.toFixed(1)},${H} L0,${H} Z`;
});

const todayPoint = computed(() => {
  const pts = actualPoints.value;
  return pts.length ? pts[pts.length - 1] : null;
});

function openEveryday() {
  sheetOpen.value = false;
  emit("everyday");
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") sheetOpen.value = false;
}

watch(sheetOpen, (open) => {
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
  if (sheetOpen.value) document.body.style.overflow = "";
});
</script>
