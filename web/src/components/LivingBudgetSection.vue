<template>
  <section id="living-budget" class="manual-section living-budget-section">
    <header class="manual-section-header charge-section-header">
      <div>
        <h3 class="manual-section-title">Living budget</h3>
        <p class="manual-section-lead">
          Monthly cap (excludes rent). +₪600/month Cibus is added automatically and matched as a groceries charge.
        </p>
      </div>
      <button
        v-if="!readonly"
        type="button"
        class="btn btn-ghost charge-section-edit-btn"
        :disabled="disabled"
        @click="editing = !editing"
      >
        {{ editing ? "Done" : "Edit" }}
      </button>
    </header>

    <ul v-if="segments.length && (!editing || readonly)" class="charge-compact-list">
      <li v-for="seg in segments" :key="livingBudgetSegmentStableKey(seg)" class="charge-compact-row">
        <div class="charge-compact-main">
          <span class="charge-compact-amount">{{ formatIls(seg.amount + CIBUS_MONTHLY_ALLOWANCE) }}</span>
          <span class="charge-compact-meta">incl. Cibus · {{ monthRangeLabel(seg.from_month, seg.through_month) }}</span>
        </div>
        <span class="recurring-status" :class="'recurring-status-' + segmentStatus(seg.from_month, seg.through_month)">
          {{ livingBudgetStatusLabel(seg) }}
        </span>
      </li>
    </ul>

    <div v-else-if="!segments.length" class="manual-empty">No budget periods configured yet.</div>

    <div v-if="editing && !readonly" class="recurring-segments">
      <article v-for="seg in segments" :key="livingBudgetSegmentStableKey(seg)" class="recurring-segment-card">
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

        <div class="recurring-segment-footer">
          <div class="field-group recurring-segment-through">
            <label class="field-label">Through</label>
            <MonthSelect v-if="!isOngoingThrough(seg.through_month)" v-model="seg.through_month" :disabled="disabled" />
            <label class="recurring-ongoing recurring-ongoing--compact">
              <input
                type="checkbox"
                :checked="isOngoingThrough(seg.through_month)"
                :disabled="disabled"
                @change="toggleOngoing(seg, ($event.target as HTMLInputElement).checked)"
              />
              <span class="recurring-ongoing-text">No end date</span>
            </label>
          </div>

          <div v-if="segments.length > 1" class="recurring-segment-actions">
            <button type="button" class="btn btn-danger" :disabled="disabled" @click="removeSegment(seg)">
              Delete period
            </button>
          </div>
        </div>
      </article>
    </div>

    <div v-if="editing && !readonly" class="living-budget-toolbar">
      <button type="button" class="btn" :disabled="disabled" @click="addSegment">Add period</button>
    </div>

    <div v-if="sortedMonthTopups.length && (!editing || readonly)" class="living-budget-topups-read">
      <h4 class="living-budget-topups-title">Extra for specific months</h4>
      <ul class="charge-compact-list">
        <li v-for="topup in sortedMonthTopups" :key="livingBudgetMonthTopupStableKey(topup)" class="charge-compact-row">
          <div class="charge-compact-main">
            <span class="charge-compact-amount">+{{ formatIls(topup.extra) }}</span>
            <span class="charge-compact-meta">
              {{ ymToLabel(topup.month) }}<template v-if="topup.note"> · {{ topup.note }}</template>
            </span>
          </div>
        </li>
      </ul>
    </div>

    <div v-if="editing && !readonly" class="living-budget-topups-edit">
      <h4 class="living-budget-topups-title">Extra for specific months</h4>
      <p class="living-budget-topups-lead">One-off boost to the cap for a single month — travel, hosting, etc.</p>

      <div v-if="sortedMonthTopups.length" class="recurring-segments">
        <article
          v-for="topup in sortedMonthTopups"
          :key="livingBudgetMonthTopupStableKey(topup)"
          class="recurring-segment-card"
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
          <div class="recurring-segment-footer">
            <div class="field-group living-budget-topup-note">
              <label class="field-label">Note (optional)</label>
              <input v-model="topup.note" class="input" placeholder="e.g. Trip to Europe" :disabled="disabled" />
            </div>
            <div class="recurring-segment-actions">
              <button type="button" class="btn btn-danger" :disabled="disabled" @click="removeMonthTopup(topup)">
                Remove
              </button>
            </div>
          </div>
        </article>
      </div>

      <div class="living-budget-toolbar">
        <button type="button" class="btn" :disabled="disabled" @click="addMonthTopup">Add extra for month</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import MonthSelect from "./MonthSelect.vue";
import { confirm } from "../composables/useConfirm";
import { formatIls } from "../utils/format";
import {
  type LivingBudgetMonthTopup,
  type LivingBudgetSegment,
  CIBUS_MONTHLY_ALLOWANCE,
  currentYearMonth,
  isOngoingThrough,
  livingBudgetMonthTopupStableKey,
  livingBudgetSegmentStableKey,
  livingBudgetStatusLabel,
  monthRangeLabel,
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

const segments = defineModel<LivingBudgetSegment[]>("segments", { required: true });
const monthTopups = defineModel<LivingBudgetMonthTopup[]>("monthTopups", { required: true });
const editing = ref(false);

const sortedMonthTopups = computed(() =>
  [...monthTopups.value].sort((a, b) => a.month.localeCompare(b.month)),
);

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

function addMonthTopup() {
  const used = new Set(monthTopups.value.map((t) => t.month));
  let month = currentYearMonth();
  while (used.has(month)) {
    month = nextMonthAfter(month);
  }
  monthTopups.value = [...monthTopups.value, { month, extra: 500 }];
}

async function removeMonthTopup(topup: LivingBudgetMonthTopup) {
  const ok = await confirm({
    title: "Remove monthly extra?",
    message: `Remove +${formatIls(topup.extra)} for ${ymToLabel(topup.month)}?`,
    confirmLabel: "Remove",
    tone: "danger",
  });
  if (!ok) return;
  const key = livingBudgetMonthTopupStableKey(topup);
  monthTopups.value = monthTopups.value.filter((t) => livingBudgetMonthTopupStableKey(t) !== key);
}
</script>
