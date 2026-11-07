<template>
  <section id="living-budget" class="manual-section living-budget-section">
    <header class="manual-section-header">
      <div>
        <h3 class="manual-section-title">Living budget</h3>
        <p class="manual-section-lead">
          Monthly Visa cap = salary after tax below, plus Cibus and rent headroom from
          <button
            v-if="!readonly"
            type="button"
            class="living-budget-cap-link"
            @click="scrollToRecurring"
          >
            Recurring monthly
          </button>
          <template v-else>Recurring monthly</template>
          — each with its own dates and amounts.
        </p>
      </div>
      <div v-if="!readonly" class="section-header-actions">
        <IconButton icon="plus" label="Add period" :disabled="disabled" @click="addSegment" />
      </div>
    </header>

    <div v-if="!segments.length" class="manual-empty">No budget periods configured yet.</div>

    <template v-else>
      <component
        :is="readonly ? 'article' : 'button'"
        v-if="headlineSegment"
        :type="readonly ? undefined : 'button'"
        class="living-budget-current"
        :class="{ 'row-tappable': !readonly }"
        :disabled="!readonly && disabled"
        :aria-label="readonly ? undefined : 'Edit current budget period'"
        @click="!readonly && startEditSegment(headlineSegment.seg)"
      >
        <div class="living-budget-current__header">
          <div>
            <p class="living-budget-current__eyebrow">
              {{ headlineSegmentIsActive ? "Current budget" : "Upcoming budget" }}
            </p>
            <div class="living-budget-current__total">{{ formatIls(segmentTotalCap(headlineSegment.seg)) }}</div>
            <p class="living-budget-current__period">
              {{ monthRangeLabel(headlineSegment.seg.from_month, headlineSegment.seg.through_month) }}
            </p>
            <p v-if="segmentCapVaries(headlineSegment.seg)" class="living-budget-current__vary">
              Total varies when Cibus or rent amounts change
            </p>
          </div>
          <span v-if="!readonly" class="row-chevron" aria-hidden="true" />
        </div>
      </component>

      <ul v-if="listedSegments.length" class="charge-compact-list living-budget-period-list">
        <li
          v-for="{ seg } in listedSegments"
          :key="`budget-seg-${seg.from_month}-${seg.through_month}`"
          class="charge-compact-row-wrap"
        >
          <article class="living-budget-card">
            <component
              :is="readonly ? 'header' : 'button'"
              :type="readonly ? undefined : 'button'"
              class="living-budget-card__header"
              :class="{ 'row-tappable living-budget-card__tap': !readonly }"
              :disabled="!readonly && disabled"
              @click="!readonly && startEditSegment(seg)"
            >
              <div class="living-budget-card__summary">
                <div class="living-budget-card__total">{{ formatIls(segmentTotalCap(seg)) }}</div>
                <div class="living-budget-card__period">{{ monthRangeLabel(seg.from_month, seg.through_month) }}</div>
                <p v-if="segmentCapVaries(seg)" class="living-budget-card__vary">
                  Total varies when Cibus or rent amounts change
                </p>
              </div>
              <div class="living-budget-card__aside">
                <span
                  class="living-budget-card__status recurring-status"
                  :class="'recurring-status-' + segmentStatus(seg.from_month, seg.through_month)"
                >
                  {{ livingBudgetStatusLabel(seg) }}
                </span>
                <span v-if="!readonly" class="row-chevron" aria-hidden="true" />
              </div>
            </component>

            <ul class="living-budget-breakdown">
              <li class="living-budget-breakdown__row">
                <span class="living-budget-breakdown__label">Salary after tax</span>
                <span class="living-budget-breakdown__value">{{ formatIls(seg.amount) }}</span>
              </li>
              <li
                v-for="addition in capAdditions(seg)"
                :key="`${addition.kind}-${addition.chargeId}-${addition.from_month}`"
                class="living-budget-breakdown__row living-budget-breakdown__row--linked"
              >
                <span class="living-budget-breakdown__label">
                  {{ addition.label }}
                  <span class="living-budget-breakdown__hint">
                    {{ monthRangeLabel(addition.from_month, addition.through_month) }}
                  </span>
                </span>
                <span class="living-budget-breakdown__value">
                  +{{ formatIls(addition.amount) }}
                  <button
                    v-if="!readonly"
                    type="button"
                    class="living-budget-cap-link"
                    @click="editRecurringCharge(addition.chargeId, addition.from_month)"
                  >
                    Edit
                  </button>
                </span>
              </li>
              <li
                v-if="!capAdditions(seg).length"
                class="living-budget-breakdown__row living-budget-breakdown__row--muted"
              >
                <span class="living-budget-breakdown__label">
                  Cibus and rent headroom
                  <span class="living-budget-breakdown__hint">not configured</span>
                </span>
                <span class="living-budget-breakdown__value">
                  <button
                    v-if="!readonly"
                    type="button"
                    class="living-budget-cap-link"
                    @click="scrollToRecurring"
                  >
                    Add in Recurring
                  </button>
                  <span v-else>—</span>
                </span>
              </li>
            </ul>
          </article>
        </li>
      </ul>

      <button
        v-if="endedSegments.length"
        type="button"
        class="btn btn-ghost household-show-more"
        @click="showEndedBudget = !showEndedBudget"
      >
        {{ showEndedBudget ? "Hide" : "Show" }} ended budget periods ({{ endedSegments.length }})
      </button>

      <ul v-if="showEndedBudget && endedSegments.length" class="charge-compact-list living-budget-period-list household-ended-list">
        <li
          v-for="{ seg } in endedSegments"
          :key="`budget-ended-${seg.from_month}-${seg.through_month}`"
          class="charge-compact-row-wrap"
        >
          <component
            :is="readonly ? 'article' : 'button'"
            :type="readonly ? undefined : 'button'"
            class="living-budget-card living-budget-card--ended"
            :class="{ 'row-tappable': !readonly }"
            :disabled="!readonly && disabled"
            @click="!readonly && startEditSegment(seg)"
          >
            <header class="living-budget-card__header">
              <div class="living-budget-card__summary">
                <div class="living-budget-card__total">{{ formatIls(segmentTotalCap(seg)) }}</div>
                <div class="living-budget-card__period">{{ monthRangeLabel(seg.from_month, seg.through_month) }}</div>
              </div>
              <div class="living-budget-card__aside">
                <span class="living-budget-card__status recurring-status recurring-status-ended">
                  {{ livingBudgetStatusLabel(seg) }}
                </span>
                <span v-if="!readonly" class="row-chevron" aria-hidden="true" />
              </div>
            </header>
          </component>
        </li>
      </ul>
    </template>

    <div v-if="sortedMonthTopups.length || !readonly" class="living-budget-topups-read">
      <div class="living-budget-topups-header">
        <h4 class="living-budget-topups-title">Extra for specific months</h4>
        <IconButton v-if="!readonly" icon="plus" label="Add extra for month" :disabled="disabled" @click="addMonthTopup" />
      </div>
      <p v-if="!readonly" class="living-budget-topups-lead">One-off boost to the cap for a single month — travel, hosting, etc.</p>

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
import { formatIls } from "@/shared/utils/format";
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
