<template>
  <SheetEditor
    :open="!!payslip"
    :title="monthTitle"
    :subtitle="payslip?.employer ?? ''"
    save-label="Done"
    :deletable="true"
    delete-label="Remove payslip"
    :busy="busy"
    @save="emit('close')"
    @cancel="emit('close')"
    @delete="emit('remove')"
  >
    <div v-if="payslip" class="ps">
      <section class="ps-hero">
        <p class="ps-label">{{ t("Net pay") }}</p>
        <p class="ps-big">{{ formatIls(payslip.totals.netPayable || payslip.totals.net) }}</p>
        <p class="ps-meta">
          {{ t("Total pay") }} {{ formatIls(payslip.totals.gross) }} · {{ t("Total deductions") }} {{ formatIls(payslip.totals.mandatoryDeductions + payslip.totals.voluntaryDeductions) }}
        </p>
        <button type="button" class="btn btn-sm" :disabled="busy" @click="emit('original')">📄 {{ t("Original (Hebrew)") }}</button>
      </section>

      <section>
        <h4 class="ps-h">{{ t("Payments") }}</h4>
        <ul class="ps-rows">
          <li v-for="(p, i) in payslip.payments" :key="i" class="ps-row">
            <span class="ps-name">
              {{ paymentLabel(p, lang) }}
              <small v-if="p.benefit">{{ t("Not paid out, taxed as income") }} · {{ formatIls(p.taxableValue ?? 0) }}</small>
              <small v-else-if="p.quantity && p.rate && p.quantity !== 1">{{ p.quantity }} × {{ formatIls(p.rate) }}</small>
            </span>
            <strong>{{ p.benefit ? "—" : formatIls(p.amount) }}</strong>
          </li>
        </ul>
      </section>

      <section>
        <h4 class="ps-h">{{ t("Deductions") }}</h4>
        <ul class="ps-rows">
          <li v-for="(d, i) in payslip.deductions" :key="i" class="ps-row ps-row--minus">
            <span class="ps-name">
              {{ deductionLabel(d, lang) }}
              <small v-if="d.kind === 'income_tax' && payslip.marginalTaxRate">{{ t("Tax bracket {n}%", { n: payslip.marginalTaxRate }) }}</small>
            </span>
            <strong>− {{ formatIls(d.amount) }}</strong>
          </li>
        </ul>
      </section>

      <section v-if="hasDeposits">
        <h4 class="ps-h">{{ t("Paid by the employer into your funds") }}</h4>
        <ul class="ps-rows">
          <li v-if="d.pensionEmployer != null" class="ps-row"><span class="ps-name">{{ t("Employer: pension") }}<small v-if="d.pensionBase">{{ t("Pension base") }} {{ formatIls(d.pensionBase) }}</small></span><strong>{{ formatIls(d.pensionEmployer) }}</strong></li>
          <li v-if="d.severance != null" class="ps-row"><span class="ps-name">{{ t("Employer: severance") }}</span><strong>{{ formatIls(d.severance) }}</strong></li>
          <li v-if="d.studyFundEmployer != null" class="ps-row"><span class="ps-name">{{ t("Employer: study fund") }}<small v-if="d.studyFundBase">{{ t("Study fund base") }} {{ formatIls(d.studyFundBase) }}</small></span><strong>{{ formatIls(d.studyFundEmployer) }}</strong></li>
        </ul>
      </section>

      <section>
        <h4 class="ps-h">{{ t("Tax this year so far") }}</h4>
        <ul class="ps-rows">
          <li v-if="tx.taxableYtd != null" class="ps-row"><span class="ps-name">{{ t("Taxable income so far") }}</span><strong>{{ formatIls(tx.taxableYtd) }}</strong></li>
          <li v-if="tx.incomeTaxYtd != null" class="ps-row"><span class="ps-name">{{ t("Income tax withheld so far") }}</span><strong>{{ formatIls(tx.incomeTaxYtd) }}</strong></li>
          <li v-if="tx.nationalInsuranceYtd != null" class="ps-row"><span class="ps-name">{{ t("National Insurance so far") }}</span><strong>{{ formatIls(tx.nationalInsuranceYtd) }}</strong></li>
          <li v-if="tx.healthTaxYtd != null" class="ps-row"><span class="ps-name">{{ t("Health tax so far") }}</span><strong>{{ formatIls(tx.healthTaxYtd) }}</strong></li>
          <li v-if="tx.creditPoints != null" class="ps-row"><span class="ps-name">{{ t("Credit points") }}</span><strong>{{ tx.creditPoints }}</strong></li>
          <li v-if="tx.monthsInCalculation != null" class="ps-row"><span class="ps-name">{{ t("Months in the calculation") }}</span><strong>{{ tx.monthsInCalculation }}</strong></li>
        </ul>
      </section>

      <section v-if="payslip.leave.length">
        <h4 class="ps-h">{{ t("Leave balances") }}</h4>
        <ul class="ps-rows">
          <li v-for="(l, i) in payslip.leave" :key="i" class="ps-row">
            <span class="ps-name">
              {{ leaveLabel(l, lang) }}
              <small>{{ leaveMeta(l) }}</small>
            </span>
            <strong>{{ l.balance ?? "—" }}</strong>
          </li>
        </ul>
      </section>

      <section v-if="job.hoursExpected || job.daysExpected">
        <h4 class="ps-h">{{ t("Work this month") }}</h4>
        <ul class="ps-rows">
          <li v-if="job.hoursExpected" class="ps-row"><span class="ps-name">{{ t("Hours") }}</span><strong>{{ job.hoursWorked ?? 0 }} / {{ job.hoursExpected }}</strong></li>
          <li v-if="job.daysExpected" class="ps-row"><span class="ps-name">{{ t("Days") }}</span><strong>{{ job.daysWorked ?? 0 }} / {{ job.daysExpected }}</strong></li>
          <li v-if="job.hourlyRate" class="ps-row"><span class="ps-name">{{ t("Hourly rate") }}</span><strong>{{ formatIls(job.hourlyRate) }}</strong></li>
        </ul>
      </section>
    </div>
  </SheetEditor>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { dateTag, locale, t } from "@/shared/i18n";
import SheetEditor from "@/shared/components/SheetEditor.vue";
import { formatIls } from "@/shared/utils/format";
import { deductionLabel, leaveLabel, paymentLabel, type Payslip, type PayslipLeave } from "@core/salary/payslip";

const props = defineProps<{ payslip: Payslip | null; busy?: boolean }>();
const emit = defineEmits<{ close: []; remove: []; original: [] }>();

const lang = computed(() => (locale.value === "en" ? "en" : "ru"));

const monthTitle = computed(() => {
  const p = props.payslip;
  if (!p) return "";
  const label = new Date(p.year, p.month - 1, 1).toLocaleDateString(dateTag(), { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
});

const d = computed(() => props.payslip?.deposits ?? ({} as Payslip["deposits"]));
const tx = computed(() => props.payslip?.tax ?? ({} as Payslip["tax"]));
const job = computed(() => props.payslip?.job ?? ({} as Payslip["job"]));
const hasDeposits = computed(() => d.value.pensionEmployer != null || d.value.studyFundEmployer != null || d.value.severance != null);

function leaveMeta(l: PayslipLeave): string {
  const parts: string[] = [];
  if (l.added) parts.push(`+${l.added}`);
  if (l.used) parts.push(`−${l.used}`);
  return parts.join(" ");
}
</script>

<style scoped>
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
.ps-meta {
  margin: 0.3rem 0 0.7rem;
  font-size: 0.88rem;
  color: var(--text-muted);
}
.ps-h {
  margin: 0 0 0.3rem;
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--text-muted);
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
.ps-name {
  display: grid;
  gap: 0.1rem;
}
.ps-name small {
  font-size: 0.78rem;
  color: var(--text-faint);
}
.ps-row--minus strong {
  font-weight: 600;
}
</style>
