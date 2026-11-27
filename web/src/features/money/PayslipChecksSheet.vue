<template>
  <BottomSheet :open="open" title="Check payslips" wide @close="emit('close')">
    <div class="pc">
      <section class="pc-hero" :class="report.flagged ? 'pc-hero--warn' : 'pc-hero--ok'">
        <p class="pc-status">{{ report.flagged ? t("Worth asking about ({n})", { n: report.flagged }) : t("All adds up") }}</p>
        <div class="pc-stats">
          <span>
            <small>{{ t("Vacation balance") }}</small>
            <strong>{{ days(report.opening) }} → {{ days(report.closing) }}</strong>
          </span>
          <span>
            <small>{{ t("Days added") }}</small>
            <strong>{{ days(report.addedTotal) }}</strong>
          </span>
          <span>
            <small>{{ t("Days taken") }}</small>
            <strong>{{ days(report.usedTotal) }}</strong>
          </span>
        </div>
        <p v-if="Math.abs(report.jumpTotal) > 0.01" class="pc-jump">
          {{ t("{n} days appeared between payslips without being added", { n: days(report.jumpTotal) }) }}
        </p>
      </section>

      <ul class="pc-rows">
        <li v-for="r in shownRows" :key="r.id" class="pc-row">
          <div class="pc-top">
            <strong>{{ monthLabel(r) }}</strong>
            <span class="pc-balance">{{ days(r.previous) }} → {{ days(r.balance) }}</span>
          </div>
          <p class="pc-meta">
            {{ t("Days added") }} {{ days(r.added) }} · {{ t("Days taken") }} {{ days(r.used) }}
          </p>
          <div class="pc-chips">
            <span v-if="r.paidDays > 0" class="pc-chip pc-chip--ok">
              {{ t("Paid {days} days · {amount}", { days: days(r.paidDays), amount: formatIlsWhole(r.paidAmount) }) }}
            </span>
            <span v-for="(f, i) in r.flags" :key="i" class="pc-chip" :class="f.severity === 'error' ? 'pc-chip--error' : 'pc-chip--warn'">
              {{ message(f) }}
            </span>
          </div>
        </li>
      </ul>

      <button v-if="allRows.length > LATEST" type="button" class="btn btn-sm pc-more" @click="showAll = !showAll">
        {{ showAll ? t("Show fewer") : t("Show all {n}", { n: allRows.length }) }}
      </button>
      <p class="pc-note">{{ t("Checks only the arithmetic on the payslips. It cannot tell what you are entitled to: ask payroll about anything flagged.") }}</p>
    </div>
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import BottomSheet from "@/shared/components/BottomSheet.vue";
import { dateTag, locale, t } from "@/shared/i18n";
import { formatIlsWhole } from "@/shared/utils/format";
import type { Payslip } from "@core/salary/payslip";
import { checkVacation, type CheckFlag, type VacationRow } from "@core/salary/payslipChecks";

const props = defineProps<{ open: boolean; payslips: Payslip[] }>();
const emit = defineEmits<{ close: [] }>();

/** A year of payslips plus the month before, as the check needs one to carry the balance from. */
const LATEST = 13;
const showAll = ref(false);
const full = computed(() => checkVacation(props.payslips));
const report = computed(() => checkVacation(props.payslips, showAll.value ? undefined : LATEST));
const allRows = computed(() => full.value.rows);
const shownRows = computed(() => [...report.value.rows].reverse());

function days(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString(locale.value === "en" ? "en-US" : "ru-RU", { maximumFractionDigits: 2 });
}

function monthLabel(r: VacationRow): string {
  const label = new Date(r.year, r.month - 1, 1).toLocaleDateString(dateTag(), { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function message(f: CheckFlag): string {
  const v = f.values;
  switch (f.kind) {
    case "accrual":
      return t("Added {added} days instead of the usual {usual}", { added: days(v.added), usual: days(v.usual) });
    case "carry":
      return t("Starts from {previous}, but last month ended at {lastBalance}", { previous: days(v.previous), lastBalance: days(v.lastBalance) });
    case "balance_math":
      return t("{previous} + {added} − {used} is not {balance}", { previous: days(v.previous), added: days(v.added), used: days(v.used), balance: days(v.balance) });
    case "paid_days":
      return t("Took {used} days, paid for {paid}", { used: days(v.used), paid: days(v.paid) });
    case "rate_math":
      return t("{quantity} × {rate} is not {amount}", { quantity: days(v.quantity), rate: days(v.rate), amount: days(v.amount) });
    case "salary_math":
      return t("Base pay plus paid days is {sum}, expected {expected}", { sum: formatIlsWhole(v.sum), expected: formatIlsWhole(v.expected) });
  }
}
</script>

<style scoped>
.pc {
  display: grid;
  gap: 1rem;
  min-width: 0;
}
.pc-hero {
  padding: 1rem 1.1rem;
  border-radius: 20px;
}
.pc-hero--ok {
  background: color-mix(in srgb, var(--success) 14%, transparent);
}
.pc-hero--warn {
  background: color-mix(in srgb, #fbbf24 16%, transparent);
}
.pc-status {
  margin: 0 0 0.7rem;
  font-size: 1.1rem;
  font-weight: 750;
}
.pc-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}
.pc-stats span {
  display: grid;
  gap: 0.1rem;
}
.pc-stats small {
  font-size: 0.75rem;
  color: var(--text-muted);
}
.pc-stats strong {
  font-variant-numeric: tabular-nums;
}
.pc-jump {
  margin: 0.7rem 0 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.pc-rows {
  list-style: none;
  margin: 0;
  padding: 0 0.85rem;
  border-radius: 20px;
  background: var(--surface);
}
.pc-row {
  padding: 0.8rem 0.1rem;
}
.pc-row + .pc-row {
  border-top: 1px solid var(--border);
}
.pc-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
}
.pc-balance {
  font-variant-numeric: tabular-nums;
  font-weight: 650;
}
.pc-meta {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.pc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.4rem;
}
.pc-chips:empty {
  display: none;
}
.pc-chip {
  padding: 0.25rem 0.6rem;
  border-radius: 12px;
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.25;
}
.pc-chip--ok {
  background: color-mix(in srgb, var(--success) 16%, transparent);
  color: var(--success);
}
.pc-chip--warn {
  background: color-mix(in srgb, #fbbf24 20%, transparent);
  color: #fbbf24;
}
.pc-chip--error {
  background: color-mix(in srgb, var(--danger) 18%, transparent);
  color: var(--danger);
}
.pc-more {
  justify-self: center;
}
.pc-note {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--text-faint);
}
</style>
