<template>
  <section id="living-budget" class="manual-section living-budget-section">
    <header class="manual-section-header">
      <div>
        <h3 class="manual-section-title">Living budget</h3>
        <p class="manual-section-lead">
          Monthly cap (excludes rent). +₪600/month Cibus is added automatically and matched as a groceries charge.
        </p>
      </div>
      <div v-if="!readonly" class="section-header-actions">
        <IconButton icon="plus" label="Add period" :disabled="disabled" @click="addSegment" />
      </div>
    </header>

    <div v-if="!segments.length" class="manual-empty">No budget periods configured yet.</div>

    <ul v-else class="charge-compact-list">
      <li v-for="(seg, index) in segments" :key="`budget-seg-${index}`" class="charge-compact-row-wrap">
        <div v-if="readonly || !isEditingSegment(index)" class="list-row">
          <div class="list-row__main">
            <div class="list-row__amounts">
              <span class="list-row__amount">{{ formatIls(seg.amount) }}</span>
              <span class="list-row__amount list-row__amount--cibus">+{{ formatIls(CIBUS_MONTHLY_ALLOWANCE) }}</span>
            </div>
            <span class="list-row__meta">Cibus · {{ monthRangeLabel(seg.from_month, seg.through_month) }}</span>
          </div>
          <span class="list-row__status recurring-status" :class="'recurring-status-' + segmentStatus(seg.from_month, seg.through_month)">
            {{ livingBudgetStatusLabel(seg) }}
          </span>
          <button
            v-if="!readonly"
            type="button"
            class="btn btn-edit"
            :disabled="disabled"
            @click="startEditSegment(index)"
          >
            Edit
          </button>
        </div>

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
              <label class="field-label">Amount (₪)</label>
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

    <div v-if="sortedMonthTopups.length || !readonly" class="living-budget-topups-read">
      <div class="living-budget-topups-header">
        <h4 class="living-budget-topups-title">Extra for specific months</h4>
        <IconButton v-if="!readonly" icon="plus" label="Add extra for month" :disabled="disabled" @click="addMonthTopup" />
      </div>
      <p v-if="!readonly" class="living-budget-topups-lead">One-off boost to the cap for a single month — travel, hosting, etc.</p>

      <ul v-if="sortedMonthTopups.length" class="charge-compact-list">
        <li v-for="(topup, index) in sortedMonthTopups" :key="topupRowKey(topup, index)" class="charge-compact-row-wrap">
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
import EditPanel from "./EditPanel.vue";
import IconButton from "./IconButton.vue";
import MonthSelect from "./MonthSelect.vue";
import ToggleSwitch from "./ToggleSwitch.vue";
import { confirm } from "../composables/useConfirm";
import { formatIls } from "../utils/format";
import {
  type LivingBudgetMonthTopup,
  type LivingBudgetSegment,
  CIBUS_MONTHLY_ALLOWANCE,
  currentYearMonth,
  isOngoingThrough,
  livingBudgetStatusLabel,
  monthRangeLabel,
  ONGOING_THROUGH_MONTH,
  segmentStatus,
  ymToLabel,
} from "../utils/livingBudget";

withDefaults(
  defineProps<{
    readonly?: boolean;
    disabled?: boolean;
  }>(),
  { readonly: false, disabled: false },
);

const emit = defineEmits<{ save: [] }>();

const segments = defineModel<LivingBudgetSegment[]>("segments", { required: true });
const monthTopups = defineModel<LivingBudgetMonthTopup[]>("monthTopups", { required: true });
const editingSegmentIndex = ref<number | null>(null);
const editingTopup = ref<LivingBudgetMonthTopup | null>(null);
const segmentEditSnapshot = ref<LivingBudgetSegment | null>(null);
const topupEditSnapshot = ref<LivingBudgetMonthTopup | null>(null);
const segmentIsNew = ref(false);
const topupIsNew = ref(false);

const sortedMonthTopups = computed(() =>
  [...monthTopups.value].sort((a, b) => a.month.localeCompare(b.month)),
);

const segmentDeleteLabel = computed(() =>
  segments.value.length <= 1 ? "Remove budget period" : "Delete period",
);

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
    seg.through_month = currentYearMonth();
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
  let fromMonth = currentYearMonth();
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
  let month = currentYearMonth();
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
