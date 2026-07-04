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
      <article v-if="headlineSegment" class="living-budget-current">
        <p class="living-budget-current__eyebrow">
          {{ headlineSegmentIsActive ? "Current budget" : "Upcoming budget" }}
        </p>
        <div class="living-budget-current__total">{{ formatIls(segmentTotalCap(headlineSegment.seg)) }}</div>
        <p class="living-budget-current__period">{{ monthRangeLabel(headlineSegment.seg.from_month, headlineSegment.seg.through_month) }}</p>
        <p v-if="segmentCapVaries(headlineSegment.seg)" class="living-budget-current__vary">
          Total varies when Cibus or rent amounts change
        </p>
      </article>

      <ul v-if="listedSegments.length" class="charge-compact-list living-budget-period-list">
        <li
          v-for="{ seg, index } in listedSegments"
          :key="`budget-seg-${index}`"
          class="charge-compact-row-wrap"
        >
          <article v-if="readonly || !isEditingSegment(index)" class="living-budget-card">
            <header class="living-budget-card__header">
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
                <div v-if="!readonly" class="living-budget-card__actions">
                  <button
                    type="button"
                    class="btn btn-edit"
                    :disabled="disabled"
                    @click="startEditSegment(index)"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </header>

            <ul class="living-budget-breakdown">
              <li class="living-budget-breakdown__row">
                <span class="living-budget-breakdown__label">
                  Salary after tax
                  <span class="living-budget-breakdown__hint">edited here</span>
                </span>
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

          <EditPanel
            v-else
            title="Edit period"
            done-label="Save"
            :disabled="disabled"
            deletable
            :delete-label="segmentDeleteLabel"
            @done="finishEditSegment(index)"
            @cancel="cancelEditSegment(index)"
            @delete="removeSegment(seg)"
          >
            <div class="recurring-segment-row">
              <div class="field-group">
                <label class="field-label">Salary after tax (₪)</label>
                <input
                  v-model.number="seg.amount"
                  class="input"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="decimal"
                  :disabled="disabled"
                />
              </div>
              <div class="field-group">
                <label class="field-label">From</label>
                <MonthSelect v-model="seg.from_month" :disabled="disabled" />
              </div>
            </div>
            <div class="field-group recurring-segment-through">
              <label class="field-label">Through</label>
              <MonthSelect v-if="!isOngoingThrough(seg.through_month)" v-model="seg.through_month" :disabled="disabled" />
              <label class="recurring-ongoing recurring-ongoing--compact">
                <ToggleSwitch
                  :model-value="isOngoingThrough(seg.through_month)"
                  :disabled="disabled"
                  @update:model-value="toggleOngoing(seg, $event)"
                />
                <span class="recurring-ongoing-text">No end date</span>
              </label>
            </div>
          </EditPanel>
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
          v-for="{ seg, index } in endedSegments"
          :key="`budget-ended-${index}`"
          class="charge-compact-row-wrap"
        >
          <article v-if="readonly || !isEditingSegment(index)" class="living-budget-card living-budget-card--ended">
            <header class="living-budget-card__header">
              <div class="living-budget-card__summary">
                <div class="living-budget-card__total">{{ formatIls(segmentTotalCap(seg)) }}</div>
                <div class="living-budget-card__period">{{ monthRangeLabel(seg.from_month, seg.through_month) }}</div>
              </div>
              <div class="living-budget-card__aside">
                <span class="living-budget-card__status recurring-status recurring-status-ended">
                  {{ livingBudgetStatusLabel(seg) }}
                </span>
                <div v-if="!readonly" class="living-budget-card__actions">
                  <button
                    type="button"
                    class="btn btn-edit"
                    :disabled="disabled"
                    @click="startEditSegment(index)"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </header>
          </article>

          <EditPanel
            v-else
            title="Edit period"
            done-label="Save"
            :disabled="disabled"
            deletable
            :delete-label="segmentDeleteLabel"
            @done="finishEditSegment(index)"
            @cancel="cancelEditSegment(index)"
            @delete="removeSegment(seg)"
          >
            <div class="recurring-segment-row">
              <div class="field-group">
                <label class="field-label">Salary after tax (₪)</label>
                <input
                  v-model.number="seg.amount"
                  class="input"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="decimal"
                  :disabled="disabled"
                />
              </div>
              <div class="field-group">
                <label class="field-label">From</label>
                <MonthSelect v-model="seg.from_month" :disabled="disabled" />
              </div>
            </div>
            <div class="field-group recurring-segment-through">
              <label class="field-label">Through</label>
              <MonthSelect v-if="!isOngoingThrough(seg.through_month)" v-model="seg.through_month" :disabled="disabled" />
              <label class="recurring-ongoing recurring-ongoing--compact">
                <ToggleSwitch
                  :model-value="isOngoingThrough(seg.through_month)"
                  :disabled="disabled"
                  @update:model-value="toggleOngoing(seg, $event)"
                />
                <span class="recurring-ongoing-text">No end date</span>
              </label>
            </div>
          </EditPanel>
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
          <div v-if="readonly || !isEditingTopup(topup)" class="list-row">
            <div class="list-row__main">
              <span class="list-row__amount">+{{ formatIls(topup.extra) }}</span>
              <span class="list-row__meta">
                {{ ymToLabel(topup.month) }}<template v-if="topup.note"> · {{ topup.note }}</template>
              </span>
            </div>
            <button
              v-if="!readonly"
              type="button"
              class="btn btn-edit"
              :disabled="disabled"
              @click="startEditTopup(topup)"
            >
              Edit
            </button>
          </div>

          <EditPanel
            v-else
            title="Edit monthly extra"
            done-label="Save"
            :disabled="disabled"
            deletable
            delete-label="Remove extra"
            @done="finishEditTopup(topup)"
            @cancel="cancelEditTopup(topup)"
            @delete="removeMonthTopup(topup)"
          >
            <div class="recurring-segment-row living-budget-topup-row">
              <div class="field-group living-budget-topup-month">
                <label class="field-label">Month</label>
                <MonthSelect v-model="topup.month" :disabled="disabled" />
              </div>
              <div class="field-group living-budget-topup-amount">
                <label class="field-label">Extra (₪)</label>
                <input
                  v-model.number="topup.extra"
                  class="input"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="decimal"
                  :disabled="disabled"
                />
              </div>
            </div>
            <div class="field-group living-budget-topup-note">
              <label class="field-label">Note (optional)</label>
              <input v-model="topup.note" class="input" placeholder="e.g. Trip to Europe" :disabled="disabled" />
            </div>
          </EditPanel>
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
          <div v-if="readonly || !isEditingTopup(topup)" class="list-row">
            <div class="list-row__main">
              <span class="list-row__amount">+{{ formatIls(topup.extra) }}</span>
              <span class="list-row__meta">
                {{ ymToLabel(topup.month) }}<template v-if="topup.note"> · {{ topup.note }}</template>
              </span>
            </div>
            <button
              v-if="!readonly"
              type="button"
              class="btn btn-edit"
              :disabled="disabled"
              @click="startEditTopup(topup)"
            >
              Edit
            </button>
          </div>

          <EditPanel
            v-else
            title="Edit monthly extra"
            done-label="Save"
            :disabled="disabled"
            deletable
            delete-label="Remove extra"
            @done="finishEditTopup(topup)"
            @cancel="cancelEditTopup(topup)"
            @delete="removeMonthTopup(topup)"
          >
            <div class="recurring-segment-row living-budget-topup-row">
              <div class="field-group living-budget-topup-month">
                <label class="field-label">Month</label>
                <MonthSelect v-model="topup.month" :disabled="disabled" />
              </div>
              <div class="field-group living-budget-topup-amount">
                <label class="field-label">Extra (₪)</label>
                <input
                  v-model.number="topup.extra"
                  class="input"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="decimal"
                  :disabled="disabled"
                />
              </div>
            </div>
            <div class="field-group living-budget-topup-note">
              <label class="field-label">Note (optional)</label>
              <input v-model="topup.note" class="input" placeholder="e.g. Trip to Europe" :disabled="disabled" />
            </div>
          </EditPanel>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import EditPanel from "@/shared/components/EditPanel.vue";
import IconButton from "@/shared/components/IconButton.vue";
import MonthSelect from "@/shared/components/MonthSelect.vue";
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
  }>(),
  { readonly: false, disabled: false, configuredCharges: () => [], referenceYm: undefined },
);

const emit = defineEmits<{
  save: [];
  editRecurringCharge: [chargeId: string, fromMonth: string];
}>();

const segments = defineModel<LivingBudgetSegment[]>("segments", { required: true });
const monthTopups = defineModel<LivingBudgetMonthTopup[]>("monthTopups", { required: true });
const editingSegmentIndex = ref<number | null>(null);
const editingTopup = ref<LivingBudgetMonthTopup | null>(null);
const segmentEditSnapshot = ref<LivingBudgetSegment | null>(null);
const topupEditSnapshot = ref<LivingBudgetMonthTopup | null>(null);
const segmentIsNew = ref(false);
const topupIsNew = ref(false);
const showEndedBudget = ref(false);
const showPastTopups = ref(false);

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
  const active = sortedSegments.value.find(
    ({ seg }) => segmentStatus(seg.from_month, seg.through_month, nowYm.value) === "active",
  );
  if (active) return active;
  return (
    sortedSegments.value.find(
      ({ seg }) => segmentStatus(seg.from_month, seg.through_month, nowYm.value) === "upcoming",
    ) ?? null
  );
});

const headlineSegmentIsActive = computed(
  () =>
    !!headlineSegment.value &&
    segmentStatus(headlineSegment.value.seg.from_month, headlineSegment.value.seg.through_month, nowYm.value) ===
      "active",
);

const listedSegments = computed(() => {
  const headline = headlineSegment.value;
  return sortedSegments.value.filter(({ seg }) => {
    if (segmentStatus(seg.from_month, seg.through_month, nowYm.value) === "ended") return false;
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

function isEditingSegment(index: number): boolean {
  return editingSegmentIndex.value === index;
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

function startEditSegment(index: number) {
  editingTopup.value = null;
  topupEditSnapshot.value = null;
  topupIsNew.value = false;
  editingSegmentIndex.value = index;
  segmentEditSnapshot.value = { ...segments.value[index] };
  segmentIsNew.value = false;
}

async function finishEditSegment(index: number) {
  if (editingSegmentIndex.value !== index) return;
  editingSegmentIndex.value = null;
  segmentEditSnapshot.value = null;
  segmentIsNew.value = false;
  emit("save");
}

function cancelEditSegment(index: number) {
  if (editingSegmentIndex.value !== index) return;

  if (segmentIsNew.value) {
    segments.value = segments.value.filter((_, i) => i !== index);
  } else if (segmentEditSnapshot.value) {
    segments.value[index] = { ...segmentEditSnapshot.value };
  }

  segmentEditSnapshot.value = null;
  segmentIsNew.value = false;
  editingSegmentIndex.value = null;
}

function startEditTopup(topup: LivingBudgetMonthTopup) {
  editingSegmentIndex.value = null;
  segmentEditSnapshot.value = null;
  segmentIsNew.value = false;
  editingTopup.value = topup;
  topupEditSnapshot.value = { ...topup };
  topupIsNew.value = false;
}

async function finishEditTopup(topup: LivingBudgetMonthTopup) {
  if (editingTopup.value !== topup) return;
  editingTopup.value = null;
  topupEditSnapshot.value = null;
  topupIsNew.value = false;
  emit("save");
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
  const sorted = [...segments.value].sort((a, b) => a.from_month.localeCompare(b.from_month));
  const last = sorted[sorted.length - 1];
  let fromMonth = nowYm.value;
  if (last) {
    if (isOngoingThrough(last.through_month)) {
      const prevYm = prevMonthBefore(fromMonth);
      if (last.from_month <= prevYm) {
        last.through_month = prevYm;
      } else {
        fromMonth = nextMonthAfter(last.from_month);
        last.through_month = prevMonthBefore(fromMonth);
      }
    } else {
      fromMonth = nextMonthAfter(last.through_month);
    }
  }
  const newSeg: LivingBudgetSegment = {
    amount: last?.amount ?? 0,
    from_month: fromMonth,
    through_month: ONGOING_THROUGH_MONTH,
  };
  segments.value = [...sorted, newSeg];
  editingTopup.value = null;
  topupEditSnapshot.value = null;
  topupIsNew.value = false;
  editingSegmentIndex.value = segments.value.length - 1;
  segmentEditSnapshot.value = { ...newSeg };
  segmentIsNew.value = true;
}

async function removeSegment(seg: LivingBudgetSegment) {
  const ok = await confirm({
    title: segments.value.length <= 1 ? "Remove budget period?" : "Delete budget period?",
    message: `Remove ${formatIls(seg.amount)} (${ymToLabel(seg.from_month)} → ${throughLabel(seg.through_month)})?`,
    confirmLabel: segments.value.length <= 1 ? "Remove" : "Delete period",
    tone: "danger",
  });
  if (!ok) return;
  const index = segments.value.indexOf(seg);
  if (editingSegmentIndex.value === index) editingSegmentIndex.value = null;
  else if (editingSegmentIndex.value !== null && editingSegmentIndex.value > index) {
    editingSegmentIndex.value -= 1;
  }
  segments.value = segments.value.filter((s) => s !== seg);
  emit("save");
}

function addMonthTopup() {
  const used = new Set(monthTopups.value.map((t) => t.month));
  let month = nowYm.value;
  while (used.has(month)) {
    month = nextMonthAfter(month);
  }
  const newTopup: LivingBudgetMonthTopup = { month, extra: 500 };
  monthTopups.value = [...monthTopups.value, newTopup];
  editingSegmentIndex.value = null;
  segmentEditSnapshot.value = null;
  segmentIsNew.value = false;
  editingTopup.value = newTopup;
  topupEditSnapshot.value = { ...newTopup };
  topupIsNew.value = true;
}

async function removeMonthTopup(topup: LivingBudgetMonthTopup) {
  const ok = await confirm({
    title: "Remove monthly extra?",
    message: `Remove +${formatIls(topup.extra)} for ${ymToLabel(topup.month)}?`,
    confirmLabel: "Remove",
    tone: "danger",
  });
  if (!ok) return;
  if (editingTopup.value === topup) editingTopup.value = null;
  monthTopups.value = monthTopups.value.filter((t) => t !== topup);
  emit("save");
}
</script>
