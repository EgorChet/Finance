<template>
  <BottomSheet :open="!!payslip" :title="monthTitle" @close="emit('close')">
    <template #head>
      <div class="ps-head">
        <h3 class="bs-title">{{ monthTitle }}</h3>
        <p v-if="payslip?.employer" class="ps-employer"><bdi dir="rtl" lang="he">{{ payslip.employer }}</bdi></p>
      </div>
    </template>

    <div v-if="payslip" class="ps">
      <section class="ps-hero">
        <p class="ps-label">{{ t("Net pay") }}</p>
        <p class="ps-big">{{ money(net) }}</p>
        <div class="ps-split">
          <span>{{ t("Total pay") }} <strong>{{ money(payslip.totals.gross) }}</strong></span>
          <span>{{ t("Total deductions") }} <strong>− {{ money(payslip.totals.mandatoryDeductions + payslip.totals.voluntaryDeductions) }}</strong></span>
        </div>
        <div class="ps-actions">
          <button type="button" class="btn btn-sm" :disabled="busy" @click="emit('original')">📄 {{ t("Original (Hebrew)") }}</button>
          <button type="button" class="btn btn-sm" :disabled="busy" @click="emit('translated')">⬇︎ {{ t("Download in Russian") }}</button>
        </div>
      </section>

      <section>
        <h4 class="ps-h">{{ t("Payments") }}</h4>
        <ul class="ps-rows">
          <li v-for="(p, i) in payslip.payments" :key="i" class="ps-row">
            <span class="ps-name">
              {{ paymentKindLabel(p.kind, lang) }}
              <small class="ps-he"><bdi dir="rtl" lang="he">{{ paymentHebrew(p) }}</bdi></small>
              <small v-if="p.benefit">{{ t("Not paid out, taxed as income") }} · {{ money(p.taxableValue ?? 0) }}</small>
              <small v-else-if="p.quantity && p.rate && p.quantity !== 1">{{ p.quantity }} × {{ money(p.rate) }}</small>
            </span>
            <strong>{{ p.benefit ? "—" : money(p.amount) }}</strong>
          </li>
        </ul>
      </section>

      <section>
        <h4 class="ps-h">{{ t("Deductions") }}</h4>
        <ul class="ps-rows">
          <li v-for="(d, i) in payslip.deductions" :key="i" class="ps-row">
            <span class="ps-name">
              {{ deductionKindLabel(d.kind, lang) }}
              <small class="ps-he"><bdi dir="rtl" lang="he">{{ d.label }}</bdi></small>
              <small v-if="d.kind === 'income_tax' && payslip.marginalTaxRate">{{ t("Tax bracket {n}%", { n: payslip.marginalTaxRate }) }}</small>
              <small v-if="d.voluntary">{{ t("Voluntary, taken from the net") }}</small>
            </span>
            <strong>− {{ money(d.amount) }}</strong>
          </li>
        </ul>
      </section>

      <section v-if="hasDeposits">
        <h4 class="ps-h">{{ t("Paid by the employer into your funds") }}</h4>
        <ul class="ps-rows">
          <li v-if="dep.pensionEmployer != null" class="ps-row">
            <span class="ps-name">{{ t("Employer: pension") }}<small class="ps-he"><bdi dir="rtl" lang="he">{{ HE.employerContribution }}</bdi></small><small v-if="dep.pensionBase">{{ t("Pension base") }} {{ money(dep.pensionBase) }}</small></span>
            <strong>{{ money(dep.pensionEmployer) }}</strong>
          </li>
          <li v-if="dep.severance != null" class="ps-row">
            <span class="ps-name">{{ t("Employer: severance") }}<small class="ps-he"><bdi dir="rtl" lang="he">{{ HE.severance }}</bdi></small></span>
            <strong>{{ money(dep.severance) }}</strong>
          </li>
          <li v-if="dep.studyFundEmployer != null" class="ps-row">
            <span class="ps-name">{{ t("Employer: study fund") }}<small class="ps-he"><bdi dir="rtl" lang="he">{{ HE.employerContribution }}</bdi></small><small v-if="dep.studyFundBase">{{ t("Study fund base") }} {{ money(dep.studyFundBase) }}</small></span>
            <strong>{{ money(dep.studyFundEmployer) }}</strong>
          </li>
        </ul>
      </section>

      <details v-if="taxRows.length" class="ps-more">
        <summary class="ps-h">{{ t("Taxes: this month and the year so far") }}</summary>
        <table class="ps-table">
          <thead>
            <tr><th></th><th>{{ t("Month") }}</th><th>{{ t("Year so far") }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in taxRows" :key="r.key">
              <td class="ps-name">{{ t(r.label) }}<small class="ps-he"><bdi dir="rtl" lang="he">{{ r.he }}</bdi></small></td>
              <td>{{ r.month == null ? "—" : money(r.month) }}</td>
              <td>{{ r.ytd == null ? "—" : money(r.ytd) }}</td>
            </tr>
            <tr v-if="tx.creditPoints != null">
              <td class="ps-name">{{ t("Credit points") }}<small class="ps-he"><bdi dir="rtl" lang="he">{{ HE.creditPoints }}</bdi></small></td>
              <td colspan="2">{{ tx.creditPoints }}</td>
            </tr>
            <tr v-if="tx.monthsInCalculation != null">
              <td class="ps-name">{{ t("Months in the calculation") }}<small class="ps-he"><bdi dir="rtl" lang="he">{{ HE.monthsInCalculation }}</bdi></small></td>
              <td colspan="2">{{ tx.monthsInCalculation }}</td>
            </tr>
          </tbody>
        </table>
      </details>

      <details v-if="payslip.leave.length" class="ps-more">
        <summary class="ps-h">{{ t("Leave balances") }}</summary>
        <ul class="ps-rows">
          <li v-for="(l, i) in payslip.leave" :key="i" class="ps-row">
            <span class="ps-name">
              {{ leaveKindLabel(l.kind, lang) }}
              <small class="ps-he"><bdi dir="rtl" lang="he">{{ l.label }}</bdi></small>
              <small>{{ leaveMeta(l) }}</small>
            </span>
            <strong>{{ l.balance ?? "—" }}</strong>
          </li>
        </ul>
      </details>

      <details v-if="workRows.length" class="ps-more">
        <summary class="ps-h">{{ t("Work this month") }}</summary>
        <ul class="ps-rows">
          <li v-for="r in workRows" :key="r.key" class="ps-row">
            <span class="ps-name">{{ t(r.label) }}<small v-if="r.he" class="ps-he"><bdi dir="rtl" lang="he">{{ r.he }}</bdi></small></span>
            <strong>{{ r.value }}</strong>
          </li>
        </ul>
      </details>
    </div>

    <template #footer>
      <button type="button" class="sheet-editor__delete" :disabled="busy" @click="emit('remove')">{{ t("Remove payslip") }}</button>
    </template>
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { dateTag, locale, t } from "@/shared/i18n";
import BottomSheet from "@/shared/components/BottomSheet.vue";
import { money } from "@/features/household/utils/payslipPrint";
import {
  PAYSLIP_HEBREW as HE,
  deductionKindLabel,
  leaveKindLabel,
  paymentHebrew,
  paymentKindLabel,
  type Payslip,
  type PayslipLeave,
} from "@core/salary/payslip";

const props = defineProps<{ payslip: Payslip | null; busy?: boolean }>();
const emit = defineEmits<{ close: []; remove: []; original: []; translated: [] }>();

const lang = computed(() => (locale.value === "en" ? "en" : "ru"));

const monthTitle = computed(() => {
  const p = props.payslip;
  if (!p) return "";
  const label = new Date(p.year, p.month - 1, 1).toLocaleDateString(dateTag(), { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
});

const net = computed(() => (props.payslip ? props.payslip.totals.netPayable || props.payslip.totals.net : 0));
const dep = computed(() => props.payslip?.deposits ?? ({} as Payslip["deposits"]));
const tx = computed(() => props.payslip?.tax ?? ({} as Payslip["tax"]));
const hasDeposits = computed(() => dep.value.pensionEmployer != null || dep.value.studyFundEmployer != null || dep.value.severance != null);

/** This month's figure next to the cumulative one, the way the payslip's tax block lays them out. */
const taxRows = computed(() => {
  const p = props.payslip;
  if (!p) return [];
  const ded = (kind: string) => p.deductions.filter((d) => d.kind === kind).reduce((s, d) => s + d.amount, 0) || null;
  const x = p.tax;
  return [
    { key: "taxable", label: "Taxable income", he: HE.taxable, month: x.taxableMonth, ytd: x.taxableYtd },
    { key: "benefit", label: "Taxable perks", he: HE.benefit, month: x.benefitMonth, ytd: x.benefitYtd },
    { key: "insurance", label: "Income for National Insurance", he: HE.insuranceBase, month: x.insuranceBaseMonth, ytd: null },
    { key: "points", label: "Value of the credit points", he: HE.creditPointsValue, month: x.creditPointsValueMonth, ytd: null },
    { key: "pension", label: "Tax credit for pension", he: HE.pensionCredit, month: x.pensionCreditMonth, ytd: null },
    { key: "income", label: "Income tax", he: HE.incomeTax, month: ded("income_tax"), ytd: x.incomeTaxYtd },
    { key: "bl", label: "National Insurance", he: HE.nationalInsurance, month: ded("national_insurance"), ytd: x.nationalInsuranceYtd },
    { key: "health", label: "Health tax", he: HE.healthTax, month: ded("health_tax"), ytd: x.healthTaxYtd },
  ].filter((r) => r.month != null || r.ytd != null);
});

const workRows = computed(() => {
  const j = props.payslip?.job;
  if (!j) return [];
  const rows: { key: string; label: string; he: string; value: string }[] = [];
  if (j.hoursExpected) rows.push({ key: "h", label: "Hours worked / expected", he: HE.hours, value: `${j.hoursWorked ?? 0} / ${j.hoursExpected}` });
  if (j.daysExpected) rows.push({ key: "d", label: "Days worked / expected", he: HE.days, value: `${j.daysWorked ?? 0} / ${j.daysExpected}` });
  if (j.hourlyRate) rows.push({ key: "r", label: "Hourly rate", he: "", value: money(j.hourlyRate) });
  if (j.scopePercent != null) rows.push({ key: "s", label: "Job scope", he: HE.scope, value: `${j.scopePercent}%` });
  if (j.seniorityYears != null) rows.push({ key: "y", label: "Seniority, years", he: HE.seniority, value: String(j.seniorityYears) });
  if (j.startDate) rows.push({ key: "st", label: "Started work", he: HE.startDate, value: j.startDate.split("-").reverse().join(".") });
  return rows;
});

function leaveMeta(l: PayslipLeave): string {
  const parts: string[] = [];
  if (l.previous != null) parts.push(t("was {n}", { n: l.previous }));
  if (l.added) parts.push(t("earned {n}", { n: l.added }));
  if (l.used) parts.push(t("used {n}", { n: l.used }));
  return parts.join(" · ");
}
</script>

<style scoped>
.ps-head {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}
.ps-employer {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.ps {
  display: grid;
  gap: 1.1rem;
}
.ps-hero {
  padding: 1rem;
  border-radius: 20px;
  background: var(--surface);
}
.ps-label {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--text-muted);
}
.ps-big {
  margin: 0.1rem 0 0;
  font-size: 2rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}
.ps-split {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 1rem;
  margin: 0.35rem 0 0.8rem;
  font-size: 0.88rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.ps-split strong {
  color: var(--text);
  font-weight: 600;
}
.ps-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.ps-h {
  margin: 0 0 0.3rem;
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--text-muted);
}
.ps-more > summary {
  cursor: pointer;
  min-height: 32px;
  display: flex;
  align-items: center;
  list-style: none;
}
.ps-more > summary::-webkit-details-marker {
  display: none;
}
.ps-more > summary::after {
  content: "›";
  margin-left: auto;
  font-size: 1.4rem;
  color: var(--text-muted);
  transition: transform 0.15s;
}
.ps-more[open] > summary::after {
  transform: rotate(90deg);
}
.ps-rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
.ps-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.55rem 0;
  font-variant-numeric: tabular-nums;
}
.ps-row + .ps-row {
  border-top: 1px solid var(--border);
}
.ps-row strong {
  white-space: nowrap;
  font-weight: 600;
}
.ps-name {
  display: grid;
  gap: 0.1rem;
}
.ps-name small {
  font-size: 0.78rem;
  color: var(--text-faint);
}
.ps-name small.ps-he {
  font-size: 0.76rem;
}
.ps-table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
.ps-table th {
  padding: 0 0 0.3rem 0.6rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-faint);
  text-align: right;
  white-space: nowrap;
}
.ps-table td {
  padding: 0.5rem 0 0.5rem 0.6rem;
  text-align: right;
  white-space: nowrap;
  vertical-align: baseline;
  border-top: 1px solid var(--border);
}
.ps-table td.ps-name {
  padding-left: 0;
  text-align: left;
  white-space: normal;
}
</style>
