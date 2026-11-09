<template>
  <section id="living-budget" class="bx-budget">
    <div v-if="!segments.length" class="bx-empty">
      <p>No monthly budget yet.</p>
      <button v-if="!readonly" type="button" class="btn btn-primary" :disabled="disabled" @click="addSegment">Set a budget</button>
    </div>

    <template v-else>
      <article v-if="headlineSegment" class="bx-hero">
        <div class="bx-hero-top">
          <span class="bx-eyebrow">
            {{ headlineSegmentIsActive ? "Monthly budget" : "Next budget" }} ·
            {{ monthRangeLabel(headlineSegment.seg.from_month, headlineSegment.seg.through_month) }}
          </span>
          <button
            v-if="!readonly"
            type="button"
            class="bx-pill"
            :disabled="disabled"
            @click="startEditSegment(headlineSegment.seg)"
          >
            Edit
          </button>
        </div>
        <p class="bx-hero-value">{{ formatIlsWhole(segmentTotalCap(headlineSegment.seg)) }}</p>

        <p class="bx-bar-label">Where it comes from</p>
        <div class="bx-bar" aria-hidden="true">
          <span
            v-for="part in sources"
            :key="part.key"
            :style="{ width: `${part.pct}%`, background: part.color }"
          />
        </div>
        <ul class="bx-legend">
          <li v-for="part in sources" :key="part.key">
            <component
              :is="readonly || !part.edit ? 'span' : 'button'"
              :type="readonly || !part.edit ? undefined : 'button'"
              class="bx-legend-item"
              @click="!readonly && part.edit && part.edit()"
            >
              <i :style="{ background: part.color }" />
              <span class="bx-legend-name">{{ part.label }}</span>
              <b>{{ formatIlsWhole(part.amount) }}</b>
            </component>
          </li>
        </ul>

        <template v-if="monthlyBills > 0">
          <p class="bx-bar-label">Where it goes each month</p>
          <div class="bx-bar" aria-hidden="true">
            <span :style="{ width: `${billsPct}%`, background: 'var(--warning)' }" />
            <span :style="{ width: `${100 - billsPct}%`, background: 'var(--success)' }" />
          </div>
          <ul class="bx-legend">
            <li>
              <button v-if="!readonly" type="button" class="bx-legend-item" @click="scrollToRecurring">
                <i style="background: var(--warning)" /><span class="bx-legend-name">Recurring bills</span><b>{{ formatIlsWhole(monthlyBills) }}</b>
              </button>
              <span v-else class="bx-legend-item">
                <i style="background: var(--warning)" /><span class="bx-legend-name">Recurring bills</span><b>{{ formatIlsWhole(monthlyBills) }}</b>
              </span>
            </li>
            <li>
              <span class="bx-legend-item">
                <i style="background: var(--success)" /><span class="bx-legend-name">Left for everything else</span><b>{{ formatIlsWhole(Math.max(0, segmentTotalCap(headlineSegment.seg) - monthlyBills)) }}</b>
              </span>
            </li>
          </ul>
        </template>
        <p v-if="segmentCapVaries(headlineSegment.seg)" class="bx-note">
          The total changes in months when Cibus or the rent cover change.
        </p>
      </article>

      <div class="bx-list-head">
        <h3>Budget periods</h3>
        <button v-if="!readonly" type="button" class="bx-pill" :disabled="disabled" @click="addSegment">+ New period</button>
      </div>
      <div class="bx-list">
        <component
          :is="readonly ? 'div' : 'button'"
          v-for="{ seg } in periodRows"
          :key="`budget-seg-${seg.from_month}-${seg.through_month}`"
          :type="readonly ? undefined : 'button'"
          class="bx-row"
          :disabled="!readonly && disabled"
          @click="!readonly && startEditSegment(seg)"
        >
          <span class="tx-row-icon" aria-hidden="true">🗓️</span>
          <span class="bx-row-body">
            <span class="bx-row-top">
              <span class="bx-row-name">{{ monthRangeLabel(seg.from_month, seg.through_month) }}</span>
              <span class="bx-row-amount">{{ formatIlsWhole(segmentTotalCap(seg)) }}</span>
            </span>
            <span class="bx-row-meta">
              <span>Salary {{ formatIlsWhole(seg.amount) }}</span>
              <span class="bx-status" :class="`bx-status--${segmentStatus(seg.from_month, seg.through_month)}`">
                {{ livingBudgetStatusLabel(seg) }}
              </span>
            </span>
          </span>
        </component>
        <button
          v-if="endedSegments.length"
          type="button"
          class="bx-row bx-row--more"
          @click="showEndedBudget = !showEndedBudget"
        >
          {{ showEndedBudget ? "Hide" : "Show" }} ended periods ({{ endedSegments.length }})
        </button>
      </div>
    </template>

    <!-- Rarely used: a quiet link until there is at least one extra. -->
    <button
      v-if="!sortedMonthTopups.length && !readonly"
      type="button"
      class="living-budget-topups-add"
      :disabled="disabled"
      @click="addMonthTopup"
    >
      + Extra money for one month <span class="living-budget-topups-add__hint">trip, guests…</span>
    </button>
    <div v-if="sortedMonthTopups.length" class="living-budget-topups-read">
      <div class="living-budget-topups-header">
        <h4 class="living-budget-topups-title">Extra for specific months</h4>
        <IconButton v-if="!readonly" icon="plus" label="Add extra for month" :disabled="disabled" @click="addMonthTopup" />
      </div>

      <ul v-if="visibleMonthTopups.length" class="charge-compact-list">
        <li v-for="(topup, index) in visibleMonthTopups" :key="topupRowKey(topup, index)" class="charge-compact-row-wrap">
          <component
            :is="readonly ? 'div' : 'button'"
            :type="readonly ? undefined : 'button'"
            class="list-row"
            :class="{ 'row-tappable': !readonly }"
            :disabled="!readonly && disabled"
            @click="!readonly && startEditTopup(topup)"
          >
            <div class="list-row__main">
              <span class="list-row__amount">+{{ formatIls(topup.extra) }}</span>
              <span class="list-row__meta">
                {{ ymToLabel(topup.month) }}<template v-if="topup.note"> · {{ topup.note }}</template>
              </span>
            </div>
            <span v-if="!readonly" class="row-chevron" aria-hidden="true" />
          </component>
        </li>
      </ul>

      <button
        v-if="pastMonthTopups.length"
        type="button"
        class="btn btn-ghost household-show-more"
        @click="showPastTopups = !showPastTopups"
      >
        {{ showPastTopups ? "Hide" : "Show" }} past month extras ({{ pastMonthTopups.length }})
      </button>

      <ul v-if="showPastTopups && pastMonthTopups.length" class="charge-compact-list household-ended-list">
        <li v-for="(topup, index) in pastMonthTopups" :key="topupRowKey(topup, index)" class="charge-compact-row-wrap">
          <component
            :is="readonly ? 'div' : 'button'"
            :type="readonly ? undefined : 'button'"
            class="list-row"
            :class="{ 'row-tappable': !readonly }"
            :disabled="!readonly && disabled"
            @click="!readonly && startEditTopup(topup)"
          >
            <div class="list-row__main">
              <span class="list-row__amount">+{{ formatIls(topup.extra) }}</span>
              <span class="list-row__meta">
                {{ ymToLabel(topup.month) }}<template v-if="topup.note"> · {{ topup.note }}</template>
              </span>
            </div>
            <span v-if="!readonly" class="row-chevron" aria-hidden="true" />
          </component>
        </li>
      </ul>
    </div>

    <SheetEditor
      :open="!readonly && !!editingSegment"
      :title="segmentIsNew ? 'New budget period' : 'Edit budget period'"
      subtitle="Cibus and rent headroom are added from Recurring monthly."
      :save-label="segmentIsNew ? 'Add period' : 'Save'"
      :deletable="!segmentIsNew"
      :delete-label="segmentDeleteLabel"
      :busy="disabled || sheetSaving"
      :error="sheetError"
      @save="editingSegment && finishEditSegment(editingSegment)"
      @cancel="editingSegment && cancelEditSegment(editingSegment)"
      @delete="editingSegment && removeSegment(editingSegment)"
    >
      <template v-if="editingSegment">
        <SheetAmountInput v-model="editingSegment.amount" label="Salary after tax" />
        <div class="sheet-field">
          <span class="sheet-field__label">From</span>
          <MonthSelect v-model="editingSegment.from_month" />
        </div>
        <label class="sheet-toggle-row">
          <span>No end date</span>
          <ToggleSwitch
            :model-value="isOngoingThrough(editingSegment.through_month)"
            @update:model-value="toggleOngoing(editingSegment, $event)"
          />
        </label>
        <div v-if="!isOngoingThrough(editingSegment.through_month)" class="sheet-field">
          <span class="sheet-field__label">Through</span>
          <MonthSelect v-model="editingSegment.through_month" />
        </div>
      </template>
    </SheetEditor>

    <SheetEditor
      :open="!readonly && !!editingTopup"
      :title="topupIsNew ? 'New monthly extra' : 'Edit monthly extra'"
      subtitle="A one-off boost to the cap for a single month."
      :save-label="topupIsNew ? 'Add extra' : 'Save'"
      :deletable="!topupIsNew"
      delete-label="Remove extra"
      :busy="disabled || sheetSaving"
      :error="sheetError"
      @save="editingTopup && finishEditTopup(editingTopup)"
      @cancel="editingTopup && cancelEditTopup(editingTopup)"
      @delete="editingTopup && removeMonthTopup(editingTopup)"
    >
      <template v-if="editingTopup">
        <SheetAmountInput v-model="editingTopup.extra" label="Extra" />
        <div class="sheet-field">
          <span class="sheet-field__label">Month</span>
          <MonthSelect v-model="editingTopup.month" />
        </div>
        <label class="sheet-field">
          <span class="sheet-field__label">Note (optional)</span>
          <input v-model="editingTopup.note" class="input" placeholder="e.g. Trip to Europe" enterkeyhint="done" />
        </label>
      </template>
    </SheetEditor>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import IconButton from "@/shared/components/IconButton.vue";
import MonthSelect from "@/shared/components/MonthSelect.vue";
import SheetAmountInput from "@/shared/components/SheetAmountInput.vue";
import SheetEditor from "@/shared/components/SheetEditor.vue";
import ToggleSwitch from "@/shared/components/ToggleSwitch.vue";
import { confirm } from "@/shared/composables/useConfirm";
import { formatIls, formatIlsWhole } from "@/shared/utils/format";
import { chargesForMonth, isMonthlyCharge } from "@/features/household/utils/fixedCharges";
import type { ConfiguredCharge } from "@/features/household/utils/fixedCharges";
import { capAdditionPeriodsForSegment } from "@/features/household/utils/budgetCapAdditions";
import { calendarMonthsInSegment } from "@/features/household/utils/fatherInjection";
import { compareMonthTopups, compareTemporalRanges, isArchivedTopupMonth } from "@/features/household/utils/householdUi";
import {
  type LivingBudgetMonthTopup,
  type LivingBudgetSegment,
  currentYearMonth,
  isOngoingThrough,
  livingBudgetBaseForMonth,
  livingBudgetStatusLabel,
  monthRangeLabel,
  ONGOING_THROUGH_MONTH,
  segmentStatus,
  ymToLabel,
} from "@/features/household/utils/livingBudget";

const props = withDefaults(
  defineProps<{
    readonly?: boolean;
    disabled?: boolean;
    configuredCharges?: ConfiguredCharge[];
    referenceYm?: string;
    /** Saves pending changes; when given, the sheet stays open on failure and shows saveError. */
    persist?: () => Promise<boolean>;
    saveError?: string;
  }>(),
  {
    readonly: false,
    disabled: false,
    configuredCharges: () => [],
    referenceYm: undefined,
    persist: undefined,
    saveError: "",
  },
);

const emit = defineEmits<{
  save: [];
  editRecurringCharge: [chargeId: string, fromMonth: string];
}>();

const segments = defineModel<LivingBudgetSegment[]>("segments", { required: true });
const monthTopups = defineModel<LivingBudgetMonthTopup[]>("monthTopups", { required: true });
const editingSegment = ref<LivingBudgetSegment | null>(null);
const editingTopup = ref<LivingBudgetMonthTopup | null>(null);
const segmentEditSnapshot = ref<LivingBudgetSegment | null>(null);
const topupEditSnapshot = ref<LivingBudgetMonthTopup | null>(null);
const segmentIsNew = ref(false);
const topupIsNew = ref(false);
const showEndedBudget = ref(false);
const showPastTopups = ref(false);
const sheetSaving = ref(false);
const sheetError = ref("");

async function requestSave(): Promise<boolean> {
  sheetError.value = "";
  if (!props.persist) {
    emit("save");
    return true;
  }
  sheetSaving.value = true;
  try {
    const ok = await props.persist();
    if (!ok) sheetError.value = props.saveError || "Could not save. Check the months and try again.";
    return ok;
  } finally {
    sheetSaving.value = false;
  }
}

const nowYm = computed(() => props.referenceYm ?? currentYearMonth());

const indexedSegments = computed(() => segments.value.map((seg, index) => ({ seg, index })));

const sortedSegments = computed(() =>
  [...indexedSegments.value].sort((a, b) =>
    compareTemporalRanges(
      a.seg.from_month,
      a.seg.through_month,
      b.seg.from_month,
      b.seg.through_month,
      nowYm.value,
    ),
  ),
);

const headlineSegment = computed(() => {
  // If we're editing a segment, keep the layout stable by using status from the snapshot
  const editingSeg = editingSegment.value;
  
  const active = sortedSegments.value.find(({ seg }) => {
    // Use snapshot data for the segment being edited to prevent jumping
    const checkSeg = seg === editingSeg && segmentEditSnapshot.value ? segmentEditSnapshot.value : seg;
    return segmentStatus(checkSeg.from_month, checkSeg.through_month, nowYm.value) === "active";
  });
  if (active) return active;
  
  return (
    sortedSegments.value.find(({ seg }) => {
      const checkSeg = seg === editingSeg && segmentEditSnapshot.value ? segmentEditSnapshot.value : seg;
      return segmentStatus(checkSeg.from_month, checkSeg.through_month, nowYm.value) === "upcoming";
    }) ?? null
  );
});

const headlineSegmentIsActive = computed(() => {
  if (!headlineSegment.value) return false;
  const editingSeg = editingSegment.value;
  const seg = headlineSegment.value.seg;
  // Use snapshot data for the segment being edited to prevent jumping
  const checkSeg = seg === editingSeg && segmentEditSnapshot.value ? segmentEditSnapshot.value : seg;
  return segmentStatus(checkSeg.from_month, checkSeg.through_month, nowYm.value) === "active";
});

const listedSegments = computed(() => {
  const headline = headlineSegment.value;
  const editingSeg = editingSegment.value;
  
  return sortedSegments.value.filter(({ seg }) => {
    // Use snapshot data for the segment being edited to prevent jumping
    const checkSeg = seg === editingSeg && segmentEditSnapshot.value ? segmentEditSnapshot.value : seg;
    if (segmentStatus(checkSeg.from_month, checkSeg.through_month, nowYm.value) === "ended") return false;
    if (!headline) return true;
    return seg !== headline.seg;
  });
});

const endedSegments = computed(() =>
  sortedSegments.value.filter(
    ({ seg }) => segmentStatus(seg.from_month, seg.through_month, nowYm.value) === "ended",
  ),
);

const sortedMonthTopups = computed(() =>
  [...monthTopups.value].sort((a, b) => compareMonthTopups(a.month, b.month, nowYm.value)),
);

const visibleMonthTopups = computed(() =>
  sortedMonthTopups.value.filter((topup) => !isArchivedTopupMonth(topup.month, nowYm.value)),
);

const pastMonthTopups = computed(() =>
  sortedMonthTopups.value.filter((topup) => isArchivedTopupMonth(topup.month, nowYm.value)),
);

const segmentDeleteLabel = computed(() =>
  segments.value.length <= 1 ? "Remove budget period" : "Delete period",
);

function representativeMonth(seg: LivingBudgetSegment): string {
  const now = nowYm.value;
  if (seg.from_month <= now && now <= seg.through_month) return now;
  return seg.from_month;
}

function segmentTotalCap(seg: LivingBudgetSegment): number {
  const ym = representativeMonth(seg);
  return livingBudgetBaseForMonth(ym, segments.value, props.configuredCharges) ?? seg.amount;
}

function segmentCapVaries(seg: LivingBudgetSegment): boolean {
  const months = calendarMonthsInSegment(seg.from_month, seg.through_month);
  const totals = new Set(
    months.map((ym) => livingBudgetBaseForMonth(ym, segments.value, props.configuredCharges)),
  );
  return totals.size > 1;
}

function capAdditions(seg: LivingBudgetSegment) {
  return capAdditionPeriodsForSegment(seg, props.configuredCharges);
}

/** Every period except ended ones (unless shown), newest first — the headline is in the hero. */
const periodRows = computed(() => [
  ...listedSegments.value,
  ...(headlineSegment.value ? [{ seg: headlineSegment.value.seg }] : []),
  ...(showEndedBudget.value ? endedSegments.value : []),
].filter((row, i, all) => all.findIndex((r) => r.seg === row.seg) === i)
  .sort((a, b) => b.seg.from_month.localeCompare(a.seg.from_month)));

const SOURCE_COLORS = ["var(--accent)", "#34d399", "#fbbf24", "#4fc3ff", "#f472b6"];

/** Salary + Cibus + rent cover active in the headline month, for the "where it comes from" bar. */
const sources = computed(() => {
  const head = headlineSegment.value?.seg;
  if (!head) return [];
  const ym = representativeMonth(head);
  const parts: { key: string; label: string; amount: number; edit?: () => void }[] = [
    { key: "salary", label: "Salary after tax", amount: head.amount, edit: () => startEditSegment(head) },
  ];
  for (const a of capAdditions(head)) {
    if (a.from_month > ym || ym > a.through_month) continue;
    parts.push({
      key: `${a.kind}-${a.chargeId}`,
      label: a.kind === "rent" ? "Rent cover" : a.label,
      amount: a.amount,
      edit: () => editRecurringCharge(a.chargeId, a.from_month),
    });
  }
  const total = parts.reduce((s, p) => s + p.amount, 0) || 1;
  return parts.map((p, i) => ({ ...p, pct: (p.amount / total) * 100, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }));
});

/** Recurring monthly bills active in the headline month (everything under Recurring, incl. rent). */
const monthlyBills = computed(() => {
  const head = headlineSegment.value?.seg;
  if (!head) return 0;
  const ym = representativeMonth(head);
  return chargesForMonth(ym, props.configuredCharges)
    .filter(isMonthlyCharge)
    .reduce((s, c) => s + c.amount, 0);
});

const billsPct = computed(() => {
  const head = headlineSegment.value?.seg;
  const total = head ? segmentTotalCap(head) : 0;
  return total > 0 ? Math.min(100, (monthlyBills.value / total) * 100) : 0;
});

function topupRowKey(topup: LivingBudgetMonthTopup, index: number): string {
  if (editingTopup.value === topup) return `topup-editing-${index}`;
  return `topup-${topup.month}-${index}`;
}

function isEditingSegment(seg: LivingBudgetSegment): boolean {
  return editingSegment.value === seg;
}

function isEditingTopup(topup: LivingBudgetMonthTopup): boolean {
  return editingTopup.value === topup;
}

function scrollToRecurring() {
  document.getElementById("recurring")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function editRecurringCharge(chargeId: string, fromMonth: string) {
  emit("editRecurringCharge", chargeId, fromMonth);
}

function startEditSegment(seg: LivingBudgetSegment) {
  editingTopup.value = null;
  topupEditSnapshot.value = null;
  topupIsNew.value = false;
  editingSegment.value = seg;
  segmentEditSnapshot.value = { ...seg };
  segmentIsNew.value = false;
  sheetError.value = "";
}

async function finishEditSegment(seg: LivingBudgetSegment) {
  if (editingSegment.value !== seg) return;
  const ok = await requestSave();
  if (!ok || editingSegment.value !== seg) return;
  editingSegment.value = null;
  segmentEditSnapshot.value = null;
  segmentIsNew.value = false;
}

function cancelEditSegment(seg: LivingBudgetSegment) {
  if (editingSegment.value !== seg) return;

  if (segmentIsNew.value) {
    // Remove the new segment
    segments.value = segments.value.filter((s) => s !== seg);
  } else if (segmentEditSnapshot.value) {
    // Restore the segment from snapshot
    const index = segments.value.indexOf(seg);
    if (index !== -1) {
      segments.value[index] = { ...segmentEditSnapshot.value };
    }
  }

  segmentEditSnapshot.value = null;
  segmentIsNew.value = false;
  editingSegment.value = null;
  sheetError.value = "";
}

function startEditTopup(topup: LivingBudgetMonthTopup) {
  editingSegment.value = null;
  segmentEditSnapshot.value = null;
  segmentIsNew.value = false;
  editingTopup.value = topup;
  topupEditSnapshot.value = { ...topup };
  topupIsNew.value = false;
  sheetError.value = "";
}

async function finishEditTopup(topup: LivingBudgetMonthTopup) {
  if (editingTopup.value !== topup) return;
  const ok = await requestSave();
  if (!ok || editingTopup.value !== topup) return;
  editingTopup.value = null;
  topupEditSnapshot.value = null;
  topupIsNew.value = false;
}

function cancelEditTopup(topup: LivingBudgetMonthTopup) {
  if (editingTopup.value !== topup) return;

  if (topupIsNew.value) {
    monthTopups.value = monthTopups.value.filter((t) => t !== topup);
  } else if (topupEditSnapshot.value) {
    Object.assign(topup, topupEditSnapshot.value);
  }

  topupEditSnapshot.value = null;
  topupIsNew.value = false;
  editingTopup.value = null;
  sheetError.value = "";
}

function throughLabel(throughMonth: string): string {
  return isOngoingThrough(throughMonth) ? "Ongoing" : ymToLabel(throughMonth);
}

function toggleOngoing(seg: LivingBudgetSegment, ongoing: boolean) {
  if (ongoing) {
    seg.through_month = ONGOING_THROUGH_MONTH;
  } else if (isOngoingThrough(seg.through_month)) {
    seg.through_month = nowYm.value;
  }
}

function nextMonthAfter(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonthBefore(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addSegment() {
  // Sort to find the chronologically last segment  
  const sorted = [...segments.value].sort((a, b) => a.from_month.localeCompare(b.from_month));
  const last = sorted[sorted.length - 1];
  
  // New segment starts the month after the last segment ends (or current month if no segments)
  let fromMonth = nowYm.value;
  if (last) {
    // If the last segment is "ongoing" (through 2035-12), start after its from_month
    // Otherwise, start the month after it ends
    const lastEndMonth = isOngoingThrough(last.through_month) ? last.from_month : last.through_month;
    fromMonth = nextMonthAfter(lastEndMonth);
  }
  
  const newSeg: LivingBudgetSegment = {
    amount: last?.amount ?? 0,
    from_month: fromMonth,
    through_month: ONGOING_THROUGH_MONTH,
  };
  
  // Add the new segment FIRST
  segments.value.push(newSeg);
  
  // NOW set the editing state - use the actual reference from the array
  const addedSegment = segments.value[segments.value.length - 1];
  
  editingTopup.value = null;
  topupEditSnapshot.value = null;
  topupIsNew.value = false;
  segmentEditSnapshot.value = { ...addedSegment };
  segmentIsNew.value = true;
  editingSegment.value = addedSegment;
  sheetError.value = "";
}

async function removeSegment(seg: LivingBudgetSegment) {
  const ok = await confirm({
    title: segments.value.length <= 1 ? "Remove budget period?" : "Delete budget period?",
    message: `Remove ${formatIls(seg.amount)} (${ymToLabel(seg.from_month)} → ${throughLabel(seg.through_month)})?`,
    confirmLabel: segments.value.length <= 1 ? "Remove" : "Delete period",
    tone: "danger",
  });
  if (!ok) return;
  
  if (editingSegment.value === seg) {
    editingSegment.value = null;
    segmentEditSnapshot.value = null;
    segmentIsNew.value = false;
  }

  segments.value = segments.value.filter((s) => s !== seg);
  await requestSave();
}

function addMonthTopup() {
  const used = new Set(monthTopups.value.map((t) => t.month));
  let month = nowYm.value;
  while (used.has(month)) {
    month = nextMonthAfter(month);
  }
  const newTopup: LivingBudgetMonthTopup = { month, extra: 500 };
  monthTopups.value = [...monthTopups.value, newTopup];
  editingSegment.value = null;
  segmentEditSnapshot.value = null;
  segmentIsNew.value = false;
  editingTopup.value = newTopup;
  topupEditSnapshot.value = { ...newTopup };
  topupIsNew.value = true;
  sheetError.value = "";
}

async function removeMonthTopup(topup: LivingBudgetMonthTopup) {
  const ok = await confirm({
    title: "Remove monthly extra?",
    message: `Remove +${formatIls(topup.extra)} for ${ymToLabel(topup.month)}?`,
    confirmLabel: "Remove",
    tone: "danger",
  });
  if (!ok) return;
  if (editingTopup.value === topup) {
    editingTopup.value = null;
    topupEditSnapshot.value = null;
    topupIsNew.value = false;
  }
  monthTopups.value = monthTopups.value.filter((t) => t !== topup);
  await requestSave();
}
</script>
