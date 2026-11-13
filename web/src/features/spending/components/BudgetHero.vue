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

    <div class="bh-chart-wrap">
      <svg class="bh-chart" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="currentColor" stop-opacity="0.22" />
            <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path v-if="actualArea" :d="actualArea" :fill="`url(#${gradId})`" />
        <path v-if="gapUnder" :d="gapUnder" class="bh-chart-gap bh-chart-gap--under" />
        <path v-if="gapOverArea" :d="gapOverArea" class="bh-chart-gap bh-chart-gap--over" />
        <path :d="planPath" class="bh-chart-plan" />
        <path v-if="actualPath" :d="actualPath" class="bh-chart-actual" />
        <circle v-if="todayPoint" :cx="todayPoint.x" :cy="todayPoint.y" r="3.5" class="bh-chart-dot" />
      </svg>
      <span
        v-if="todayPoint && gapLabel"
        class="bh-gap-label"
        :class="gapOver ? 'bh-gap-label--over' : 'bh-gap-label--under'"
        :style="{
          left: `${(todayPoint.x / W) * 100}%`,
          top: `${(todayPoint.y / H) * 100}%`,
          transform: todayPoint.x < W * 0.3 ? 'translate(-10%, -150%)' : 'translate(-100%, -150%)',
        }"
      >{{ gapLabel }}</span>
    </div>
    <div class="bh-axis" aria-hidden="true">
      <span>Day 1</span>
      <span v-if="zoomed && windowEnd < plan.cycleLength">Day {{ windowEnd }} →</span>
      <span v-else>Day {{ plan.cycleLength }}</span>
    </div>
    <div class="bh-legend">
      <span aria-hidden="true"><i class="bh-key bh-key--actual" />You</span>
      <span aria-hidden="true"><i class="bh-key bh-key--plan" />Your usual pace</span>
      <button
        v-if="plan.daysLeft > 0 && plan.dayIndex < plan.cycleLength * 0.7"
        type="button"
        class="bh-zoom"
        @click.stop="zoomed = !zoomed"
        @keydown.enter.stop
      >
        {{ zoomed ? "Whole cycle" : "Zoom in" }}
      </button>
    </div>

    <div v-if="byDay || setAsideLine" class="bh-chips">
      <span v-if="byDay" class="bh-chip" :class="{ 'bh-chip--record': byDay.record }">{{ byDay.line }}</span>
      <span v-if="setAsideLine" class="bh-chip">{{ setAsideLine }}</span>
    </div>

    <div class="bh-stats">
      <div>
        <span>Free to spend</span>
        <strong>{{ whole(Math.max(0, plan.flexLeft)) }}</strong>
      </div>
      <div>
        <span>Spent</span>
        <strong>{{ whole(plan.spentOnCap) }}</strong>
      </div>
      <div v-if="reserved > 0">
        <span>Set aside</span>
        <strong>{{ whole(reserved) }}</strong>
      </div>
      <div v-else>
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

        <section v-if="tight" class="bh-tight">
          <p class="bh-tight-title">Getting back on track</p>
          <p class="bh-tight-text">
            After bills you have <b>{{ whole(tight.freeLeft) }}</b> for {{ plan.daysLeft }} {{ plan.daysLeft === 1 ? "day" : "days" }}.
            You usually spend about <b>{{ whole(tight.needAhead) }}</b> on everyday things in that time —
            <b>{{ whole(tight.shortBy) }}</b> more than you have.
          </p>
          <ul class="bh-tight-list">
            <li v-if="tight.homeDays != null">
              🏠 <b>{{ tight.homeDays }} stay-home {{ tight.homeDays === 1 ? "day" : "days" }}</b> — groceries and essentials only.
              A normal day has ~{{ whole(tight.pausablePerDay) }} of eating out, coffee and shopping, so that closes the gap.
            </li>
            <li v-else-if="tight.homeAllDaysSaving > 0">
              🏠 <b>Groceries and essentials only</b> for the rest of the cycle saves ~{{ whole(tight.homeAllDaysSaving) }} —
              not the whole {{ whole(tight.shortBy) }}, so it needs a top-up too.
            </li>
            <li v-if="tight.cuts.length">
              ⏸ <b>Biggest to pause:</b>
              {{ tight.cuts.map((c) => `${c.category.toLowerCase()} ~${whole(c.usualAhead)}`).join(", ") }}
              (usual for the days left).
            </li>
            <li>
              💰 Covering it from savings? Add a <b>{{ whole(topUpSuggestion) }}</b> top-up for this month under
              <RouterLink class="bh-link" to="/app/household#living-budget" @click="sheetOpen = false">Budget ›</RouterLink>
            </li>
          </ul>
        </section>

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

        <section v-if="plan.byThisDay" class="bh-compare">
          <div class="bh-compare-head">
            <p class="bh-compare-title">By day {{ plan.byThisDay.day }}, cycle by cycle</p>
            <div class="seg bh-compare-seg" role="tablist">
              <button type="button" class="seg-btn" :class="{ 'seg-btn--on': compareMode === 'everyday' }" @click="compareMode = 'everyday'">Everyday</button>
              <button type="button" class="seg-btn" :class="{ 'seg-btn--on': compareMode === 'total' }" @click="compareMode = 'total'">Everything</button>
            </div>
          </div>
          <p class="bh-compare-note">{{ compareNote }}</p>
          <ul class="bh-compare-list">
            <li v-for="row in compareRows" :key="row.key" :class="{ 'bh-compare-row--now': row.now }">
              <span class="bh-compare-label">{{ row.label }}</span>
              <span class="bh-compare-track"><span :style="{ width: `${row.pct}%` }" /></span>
              <b>{{ whole(row.value) }}</b>
            </li>
          </ul>
        </section>

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
import { formatIlsWhole, roundMoney } from "@/shared/utils/format";

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
  // On a tight cycle "under plan" vs a scaled-down pace misleads; the strip below says the real gap.
  if (p.tight) return `${days} · ${whole(p.tight.shortBy)} short ›`;
  if (Math.abs(p.buffer) < 1) return `Right on plan · ${days}`;
  return `${whole(Math.abs(p.buffer))} ${p.buffer > 0 ? "under" : "over"} plan · ${days}`;
});

const billRows = computed(() =>
  props.plan.committedRows.map((r) => ({
    label:
      r.kind === "upcoming"
        ? `${r.label} · set aside, not charged yet`
        : r.kind === "vaad" && props.plan.vaadReserve > 0
          ? `${r.label} (set aside)`
          : r.label,
    amount: r.amount,
  })),
);

const tight = computed(() => (props.plan.daysLeft > 0 ? props.plan.tight : null));
/** Gap rounded up to the next ₪100. */
const topUpSuggestion = computed(() => (tight.value ? Math.ceil(tight.value.shortBy / 100) * 100 : 0));

/** Money already promised to charges that haven't gone through yet. */
const reserved = computed(() => roundMoney(props.plan.upcomingReserve + props.plan.vaadReserve));

/** "🧾 6 bills to come" — why the daily number is lower (amount under Set aside, names in the sheet). */
const setAsideLine = computed(() => {
  if (reserved.value < 1 || props.plan.daysLeft === 0) return "";
  const names = props.plan.committedRows
    .filter((r) => r.kind === "upcoming")
    .map((r) => r.label.replace(/\s*\(.*\)\s*$/, ""));
  if (!names.length) return "";
  return `🧾 ${names.length} ${names.length === 1 ? "bill" : "bills"} to come`;
});

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

// ── By this day, cycle by cycle (plain amounts, no scaling) ──
const compareMode = ref<"everyday" | "total">("everyday");

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const byDay = computed(() => {
  const b = props.plan.byThisDay;
  if (!b || props.plan.dayIndex < 1) return null;
  const n = b.past.length + 1;
  const record = b.everydayRank === 1 || b.totalRank === 1;
  const d = b.day;
  // Short chip; the full comparison (and the data date) is in the details sheet.
  // When the card data is older than today, name its date so it can't clash with "Day N of 30".
  const when = b.dataAsOf
    ? `by ${new Date(`${b.dataAsOf}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : `by day ${d}`;
  const stale = b.dataAgeDays >= 3 ? " ⚠️" : "";
  if (b.everydayRank === 1) return { record, line: `🔺 Record ${when} · ${whole(b.everyday)}${stale}` };
  if (b.totalRank === 1) return { record, line: `🔺 Record ${when} incl. bills${stale}` };
  return { record, line: `${ordinal(b.everydayRank)} of ${n} cycles ${when}${stale}` };
});

const compareRows = computed(() => {
  const b = props.plan.byThisDay;
  if (!b) return [];
  const key = compareMode.value;
  const rows = [
    { key: "now", label: "This cycle", value: b[key], now: true },
    ...b.past.map((p) => ({ key: p.cycleStart, label: p.label, value: p[key], now: false })),
  ].sort((a, c) => c.value - a.value);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows.map((r) => ({ ...r, pct: Math.round((r.value / max) * 100) }));
});

const compareNote = computed(() => {
  const b = props.plan.byThisDay;
  if (!b) return "";
  const rank = compareMode.value === "everyday" ? b.everydayRank : b.totalRank;
  const n = b.past.length + 1;
  const what = compareMode.value === "everyday" ? "everyday spending (what the card paces)" : "everything on the card, incl. bills and installments";
  const asOf = b.dataAsOf
    ? ` Compared through day ${b.day}: your card data is from the ${b.dataAsOf.slice(8, 10)}/${b.dataAsOf.slice(5, 7)} sync.`
    : "";
  return `${rank === 1 ? "The most" : `${ordinal(rank)} most`} of ${n} cycles — ${what}, actual shekels, nothing scaled.${asOf}`;
});

// ── Chart ──
// Zoomed by default: days so far plus a little ahead, height fitted to that window, so a
// real difference from your usual pace is visible instead of a few pixels on a month-high scale.
const W = 300;
const H = 96;
const PAD = 6;
const zoomed = ref(true);

const windowEnd = computed(() => {
  const L = props.plan.cycleLength;
  if (!zoomed.value) return L;
  return Math.min(L, Math.max(7, Math.ceil(props.plan.dayIndex * 1.4) + 1));
});

const maxY = computed(() => {
  const end = windowEnd.value;
  const plan = props.plan.planByDay.slice(0, end);
  const top = Math.max(1, ...props.plan.actualByDay, ...plan);
  return top * (zoomed.value ? 1.15 : 1.06);
});

const x = (day: number) => (day / windowEnd.value) * W;
const y = (v: number) => H - PAD - (v / maxY.value) * (H - PAD * 2);

const planPoints = computed(() => [
  { x: 0, y: y(0) },
  ...props.plan.planByDay.slice(0, windowEnd.value).map((v, i) => ({ x: x(i + 1), y: y(v) })),
]);

const toPath = (pts: { x: number; y: number }[]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

const planPath = computed(() => toPath(planPoints.value));

const actualPoints = computed(() => {
  const a = props.plan.actualByDay;
  if (!a.length) return [];
  return [{ x: 0, y: y(0) }, ...a.map((v, i) => ({ x: x(i + 1), y: y(v) }))];
});

const actualPath = computed(() => (actualPoints.value.length ? toPath(actualPoints.value) : ""));

const actualArea = computed(() => {
  const pts = actualPoints.value;
  if (!pts.length) return "";
  const last = pts[pts.length - 1];
  return `${actualPath.value} L${last.x.toFixed(1)},${H} L0,${H} Z`;
});

/**
 * Shaded band between your line and the usual-pace line, up to today: red on the days you
 * were above your usual pace, green on the days you were below. (Smaller y = higher on screen.)
 */
function gapBand(pick: (actualY: number, planY: number) => number): string {
  const a = actualPoints.value;
  if (a.length < 2) return "";
  const p = planPoints.value.slice(0, a.length);
  const edge = a.map((pt, i) => ({ x: pt.x, y: pick(pt.y, p[i]?.y ?? pt.y) }));
  const back = [...p].reverse();
  return `${toPath(edge)} ${back.map((pt) => `L${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ")} Z`;
}
const gapOverArea = computed(() => gapBand((ay, py) => Math.min(ay, py)));
const gapUnder = computed(() => gapBand((ay, py) => Math.max(ay, py)));

/** Same number as the "over / under plan" line above the chart. */
const gapOver = computed(() => props.plan.buffer < 0);
const gapLabel = computed(() => {
  const b = props.plan.buffer;
  if (Math.abs(b) < 1) return "";
  return `${b < 0 ? "+" : "−"}${whole(Math.abs(b))}`;
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
