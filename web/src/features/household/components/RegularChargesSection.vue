<template>
  <section id="card-bills" class="bx-section">
    <div class="bx-list-head">
      <h3>
        Bills on your card
        <span v-if="setAsideTotal > 0" class="bx-list-total">{{ formatIlsWhole(setAsideTotal) }} set aside now</span>
      </h3>
    </div>
    <p class="bx-section-note">
      Bills due this cycle are set aside until they're charged; "Next cycle" ones aren't counted yet. Amounts are learned from your statements.
    </p>
    <div class="bx-list">
      <component
        :is="readonly ? 'div' : 'button'"
        v-for="row in rows"
        :key="row.id"
        :type="readonly ? undefined : 'button'"
        class="bx-row"
        :class="{ 'bx-row--off': row.off }"
        :disabled="!readonly && saving"
        @click="!readonly && startEdit(row.id)"
      >
        <MerchantIcon :merchant-he="BILL_MARKS[row.id]?.he" :category="BILL_MARKS[row.id]?.category ?? 'Housing'" />
        <span class="bx-row-body">
          <span class="bx-row-top">
            <span class="bx-row-name">{{ row.name }}</span>
            <span class="bx-row-amount">{{ row.exact ? "" : "~" }}{{ formatIlsWhole(row.amount) }}</span>
          </span>
          <span class="bx-row-meta">
            <span>{{ row.meta }}</span>
            <span v-if="row.pill" class="bx-status" :class="`bx-status--${row.pill.cls}`">{{ row.pill.label }}</span>
          </span>
        </span>
      </component>
    </div>

    <SheetEditor
      :open="!readonly && !!editing"
      :title="editingRule?.name ?? ''"
      :subtitle="editingRule ? rhythm(editingRule) : ''"
      save-label="Save"
      :busy="saving"
      :error="error"
      @save="saveEdit"
      @cancel="editing = null"
    >
      <template v-if="editing && editingRule">
        <label class="sheet-toggle-row">
          <span>Set aside each cycle</span>
          <ToggleSwitch v-model="editing.on" />
        </label>
        <SheetAmountInput
          v-model="editing.amount"
          label="Amount"
          :placeholder="String(Math.round(editingEstimate))"
          :hint="`Leave empty to use the learned amount (~${formatIlsWhole(editingEstimate)}).`"
        />
      </template>
    </SheetEditor>
  </section>
</template>

<script setup lang="ts">
import MerchantIcon from "@/shared/components/MerchantIcon.vue";
import { computed, onMounted, ref, watch } from "vue";
import { computeLiveBudgetPlan } from "@/features/spending/utils/paceHealth";
import type { BudgetPlan } from "@core/spending/budgetPlan";
import type { ConfiguredCharge } from "@/features/household/utils/fixedCharges";
import { livingBudgetForMonth, normalizeLivingBudgetMonthTopup, normalizeLivingBudgetSegment } from "@/features/household/utils/livingBudget";
import {
  DEFAULT_REGULAR_CHARGES,
  regularChargesForCycle,
  resolveRegularCharges,
  rulesCoveredByConfigured,
  type RegularChargeOverrides,
  type RegularChargeRule,
  type RegularChargeStatus,
} from "@core/spending/regularCharges";
import { fetchReport, saveRegularCharges } from "@/shared/api/client";
import SheetAmountInput from "@/shared/components/SheetAmountInput.vue";
import SheetEditor from "@/shared/components/SheetEditor.vue";
import ToggleSwitch from "@/shared/components/ToggleSwitch.vue";
import { useAuthStore } from "@/shared/stores/auth";
import { invalidateAllDataCaches } from "@/shared/stores/invalidateCaches";
import { useHomeDataStore } from "@/features/home/stores/homeData";
import type { Transaction } from "@/shared/types";
import { referenceDate } from "@/shared/utils/appDate";
import { formatIlsWhole } from "@/shared/utils/format";
import {
  cycleStartForDate,
  findPartialMonth,
  getCycleRangeForStart,
  loadCycleDay,
} from "@/features/spending/utils/pace";

const props = defineProps<{ readonly: boolean }>();
const emit = defineEmits<{ saved: [string]; monthly: [number]; plan: [BudgetPlan | null] }>();

/** Which brand mark / category icon each bill line shows (the name as it appears on the card). */
const BILL_MARKS: Record<string, { he?: string; category: string }> = {
  vaad: { he: "ועד הבית", category: "Housing" },
  chatgpt: { he: "OPENAI", category: "Subscriptions" },
  cursor: { he: "CURSOR", category: "Subscriptions" },
  bezeq: { he: "בזק", category: "Subscriptions" },
  hot: { he: "הוט מובייל", category: "Subscriptions" },
  anthropic: { he: "ANTHROPIC", category: "Subscriptions" },
  apple: { he: "APPLE.COM", category: "Subscriptions" },
  hairdresser: { category: "Beauty & Personal Care" },
  nails: { category: "Nails" },
  arnona: { he: "עיריית נתניה", category: "Housing" },
  electricity: { he: "חברת החשמל", category: "Housing" },
  water: { he: "מי נתניה", category: "Housing" },
  gas: { he: "סופרגז", category: "Housing" },
};

const auth = useAuthStore();
const homeData = useHomeDataStore();

const overrides = ref<RegularChargeOverrides>({});
const history = ref<Transaction[]>([]);
const cycleTxs = ref<Transaction[]>([]);
const cycle = ref<{ start: string; end: string; today: string } | null>(null);
const saving = ref(false);
const error = ref("");
const editing = ref<{ id: string; on: boolean; amount: number } | null>(null);
const configured = ref<ConfiguredCharge[]>([]);
const budget = ref<number | null>(null);

/** Bills you also entered under Budget → Recurring: counted there, not here. */
const covered = computed(() =>
  rulesCoveredByConfigured(DEFAULT_REGULAR_CHARGES, configured.value.filter((c) => c.schedule !== "once")),
);

/** This cycle's plan — the same numbers the Spending screen shows. */
const plan = computed((): BudgetPlan | null => {
  if (!cycle.value || budget.value == null) return null;
  return computeLiveBudgetPlan({
    cycleTransactions: cycleTxs.value,
    cycleDay: loadCycleDay(),
    cycleStart: cycle.value.start,
    referenceDate: referenceDate(auth.isDemo, auth.demoAsOf),
    livingBudget: budget.value,
    history: history.value,
    configuredCharges: configured.value,
    regularCharges: overrides.value,
  });
});
watch(plan, (p) => emit("plan", p), { immediate: true });

function rhythm(rule: RegularChargeRule): string {
  if (rule.irregular) return "Whenever it comes";
  return rule.everyMonths === 2 ? "Every 2 months" : "Every month";
}

function shortDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Status for every line, also the switched-off ones (so their amount still shows). */
const statuses = computed((): Map<string, RegularChargeStatus> => {
  if (!cycle.value) return new Map();
  const amountsOnly: RegularChargeOverrides = {};
  for (const [id, o] of Object.entries(overrides.value)) if (o.amount) amountsOnly[id] = { amount: o.amount };
  const list = regularChargesForCycle(
    resolveRegularCharges(amountsOnly),
    cycleTxs.value,
    history.value,
    cycle.value.start,
    cycle.value.end,
    cycle.value.today,
  );
  return new Map(list.map((s) => [s.id, s]));
});

const rows = computed(() =>
  DEFAULT_REGULAR_CHARGES.map((rule) => {
    const s = statuses.value.get(rule.id);
    const off = !!overrides.value[rule.id]?.off;
    const amount = s?.amount ?? rule.defaultAmount;
    let pill: { label: string; cls: string } | null = null;
    let when = "";
    if (off) pill = { label: "Off", cls: "ended" };
    else if (covered.value.has(rule.id)) pill = { label: "Counted in Recurring", cls: "ended" };
    else if (s?.state === "posted") pill = { label: `Charged ${s.date ? shortDate(s.date) : ""}`.trim(), cls: "active" };
    else if (s?.state === "due") {
      pill = { label: s.late ? "Late · set aside" : "Set aside", cls: "upcoming" };
      if (s.date) when = s.late ? `was due ${shortDate(s.date)}` : `≈ ${shortDate(s.date)}`;
    } else if (s?.state === "later" && s.date) {
      // Expected after this cycle ends: not set aside now.
      pill = { label: "Next cycle", cls: "ended" };
      when = `next ≈ ${shortDate(s.date)}`;
    }
    else if (s?.state === "missed") {
      pill = { label: "Didn't come · released", cls: "ended" };
      if (s.date) when = `was due ${shortDate(s.date)}`;
    } else if (s?.state === "unknown" && !s.date) {
      pill = { label: "Not on the card yet", cls: "ended" };
    }
    const basis = s && s.state !== "posted" ? s.basis : "";
    const meta = [rhythm(rule), when, basis].filter(Boolean).join(" · ");
    return {
      id: rule.id,
      name: rule.name,
      amount,
      exact: s?.state === "posted" || rule.exactAmount != null || !!overrides.value[rule.id]?.amount,
      off: off || covered.value.has(rule.id),
      pill,
      meta,
    };
  }),
);

const setAsideTotal = computed(() =>
  rows.value.reduce((sum, r) => {
    const s = statuses.value.get(r.id);
    return !r.off && s?.state === "due" ? sum + s.amount : sum;
  }, 0),
);

/** Average per month of the lines in use (2-monthly bills count half; never-seen ones skipped). */
const monthlyAverage = computed(() =>
  Math.round(
    DEFAULT_REGULAR_CHARGES.reduce((sum, rule) => {
      if (overrides.value[rule.id]?.off || covered.value.has(rule.id)) return sum;
      const s = statuses.value.get(rule.id);
      if (!s || (s.state === "unknown" && !s.date && !rule.irregular)) return sum;
      return sum + s.amount / rule.everyMonths;
    }, 0),
  ),
);
watch(monthlyAverage, (v) => emit("monthly", v), { immediate: true });

const editingRule = computed(() => DEFAULT_REGULAR_CHARGES.find((r) => r.id === editing.value?.id) ?? null);
const editingEstimate = computed(() => {
  const id = editing.value?.id;
  if (!id) return 0;
  // The learned amount, ignoring a hand-set one.
  if (!cycle.value) return editingRule.value?.defaultAmount ?? 0;
  const rule = DEFAULT_REGULAR_CHARGES.find((r) => r.id === id)!;
  const [s] = regularChargesForCycle([rule], cycleTxs.value, history.value, cycle.value.start, cycle.value.end, cycle.value.today);
  return s?.amount ?? rule.defaultAmount;
});

function startEdit(id: string) {
  error.value = "";
  const o = overrides.value[id] ?? {};
  editing.value = { id, on: !o.off, amount: o.amount ?? 0 };
}

async function saveEdit() {
  const e = editing.value;
  if (!e) return;
  const next: RegularChargeOverrides = { ...overrides.value };
  const amount = e.amount > 0 ? Math.round(e.amount * 100) / 100 : null;
  if (e.on && amount == null) delete next[e.id];
  else next[e.id] = { ...(e.on ? {} : { off: true }), ...(amount != null ? { amount } : {}) };
  saving.value = true;
  error.value = "";
  try {
    const res = await saveRegularCharges(next, auth.token || undefined);
    overrides.value = res.overrides;
    editing.value = null;
    invalidateAllDataCaches();
    emit("saved", `Saved ${editingRule.value?.name ?? "bill"}`);
  } catch {
    error.value = "Could not save — try again.";
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  try {
    const bundle = await homeData.load(auth.isDemo, auth.token || undefined);
    overrides.value = bundle.regular_charges ?? {};
    configured.value = bundle.fixed_charges ?? [];
    history.value = bundle.report?.transactions ?? [];
    const cycleDay = loadCycleDay();
    const now = referenceDate(auth.isDemo, auth.demoAsOf);
    const start = cycleStartForDate(now, cycleDay);
    const { end } = getCycleRangeForStart(start, cycleDay);
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    cycle.value = { start, end, today };
    budget.value = livingBudgetForMonth(
      start.slice(0, 7),
      bundle.living_budget.segments.map(normalizeLivingBudgetSegment),
      (bundle.living_budget.month_topups || []).map(normalizeLivingBudgetMonthTopup),
      configured.value,
    );
    const partial = findPartialMonth(bundle.months, start, cycleDay);
    if (partial) {
      const r = await fetchReport(auth.isDemo, partial.key, auth.token || undefined);
      cycleTxs.value = r.transactions;
    } else {
      cycleTxs.value = history.value.filter((t) => t.date.slice(0, 10) >= start && t.date.slice(0, 10) <= end);
    }
  } catch (e) {
    // The list still shows with the usual amounts.
    console.warn("Bills on your card: could not load history", e);
  }
});

void props;
</script>
