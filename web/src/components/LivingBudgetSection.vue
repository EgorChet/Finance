<template>
  <section id="living-budget" class="manual-section living-budget-section">
    <header class="manual-section-header">
      <h3 class="manual-section-title">Living budget</h3>
      <p class="manual-section-lead">
        Monthly card spending cap (excludes rent). Each billing cycle uses the amount active for that month.
      </p>
      <p v-if="segments.length" class="living-budget-timeline">{{ timelineSummary }}</p>
    </header>

    <div v-if="segments.length" class="recurring-segments">
      <article v-for="seg in segments" :key="livingBudgetSegmentStableKey(seg)" class="recurring-segment-card">
        <div class="recurring-segment-head">
          <span v-if="readonly" class="recurring-segment-amount-display">{{ formatIls(seg.amount) }}</span>
          <span class="recurring-status" :class="'recurring-status-' + segmentStatus(seg.from_month, seg.through_month)">
            {{ livingBudgetStatusLabel(seg) }}
          </span>
        </div>

        <div class="recurring-segment-row">
          <div class="field-group">
            <label class="field-label">Amount (₪)</label>
            <input
              v-if="!readonly"
              v-model.number="seg.amount"
              class="input"
              type="number"
              min="0"
              step="1"
              inputmode="decimal"
            />
            <p v-else class="recurring-segment-amount-display">{{ formatIls(seg.amount) }}</p>
          </div>

          <div class="field-group">
            <label class="field-label">From</label>
            <MonthSelect v-if="!readonly" v-model="seg.from_month" />
            <p v-else style="margin: 0">{{ ymToLabel(seg.from_month) }}</p>
          </div>
        </div>

        <div class="recurring-segment-footer">
          <div class="field-group recurring-segment-through">
            <label class="field-label">Through</label>
            <template v-if="!readonly">
              <MonthSelect v-if="!isOngoingThrough(seg.through_month)" v-model="seg.through_month" />
              <label class="recurring-ongoing recurring-ongoing--compact">
                <input
                  type="checkbox"
                  :checked="isOngoingThrough(seg.through_month)"
                  @change="toggleOngoing(seg, ($event.target as HTMLInputElement).checked)"
                />
                <span class="recurring-ongoing-text">No end date</span>
              </label>
            </template>
            <p v-else style="margin: 0">{{ throughLabel(seg.through_month) }}</p>
          </div>

          <div v-if="!readonly && segments.length > 1" class="recurring-segment-actions">
            <button type="button" class="btn btn-danger" :disabled="disabled" @click="removeSegment(seg)">
              Delete period
            </button>
          </div>
        </div>
      </article>
    </div>

    <p v-else class="manual-empty">No budget periods configured yet.</p>

    <div v-if="!readonly" class="living-budget-toolbar">
      <button type="button" class="btn" :disabled="disabled" @click="addSegment">Add period</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import MonthSelect from "./MonthSelect.vue";
import { confirm } from "../composables/useConfirm";
import { formatIls } from "../utils/format";
import {
  type LivingBudgetSegment,
  currentYearMonth,
  isOngoingThrough,
  livingBudgetSegmentStableKey,
  livingBudgetStatusLabel,
  livingBudgetTimelineSummary,
  ONGOING_THROUGH_MONTH,
  segmentStatus,
  ymToLabel,
} from "../utils/livingBudget";

const props = withDefaults(
  defineProps<{
    readonly?: boolean;
    disabled?: boolean;
  }>(),
  { readonly: false, disabled: false },
);

const segments = defineModel<LivingBudgetSegment[]>({ required: true });

const timelineSummary = computed(() => livingBudgetTimelineSummary(segments.value));

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
  segments.value = [
    ...sorted,
    {
      amount: last?.amount ?? 0,
      from_month: fromMonth,
      through_month: ONGOING_THROUGH_MONTH,
    },
  ];
}

async function removeSegment(seg: LivingBudgetSegment) {
  const ok = await confirm({
    title: "Delete budget period?",
    message: `Remove ${formatIls(seg.amount)} (${ymToLabel(seg.from_month)} → ${throughLabel(seg.through_month)})?`,
    confirmLabel: "Delete period",
    tone: "danger",
  });
  if (!ok) return;
  const key = livingBudgetSegmentStableKey(seg);
  segments.value = segments.value.filter((s) => livingBudgetSegmentStableKey(s) !== key);
}
</script>
