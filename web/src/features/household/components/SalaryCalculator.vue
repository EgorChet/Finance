<template>
  <BottomSheet :open="open" :title="t('Salary calculator')" wide @close="emit('close')">
    <template #head>
      <div class="sal-head">
        <h3 class="bs-title">{{ t("Salary calculator") }}</h3>
        <p class="sal-head-sub">{{ t("From gross pay to take-home, the way a payslip works it out") }}</p>
      </div>
    </template>
    <div class="sal">
      <div class="seg" role="tablist">
        <button type="button" role="tab" class="seg-btn" :class="{ 'seg-btn--on': state.mode === 'gross' }" :aria-selected="state.mode === 'gross'" @click="state.mode = 'gross'">
          {{ t("Gross → net") }}
        </button>
        <button type="button" role="tab" class="seg-btn" :class="{ 'seg-btn--on': state.mode === 'net' }" :aria-selected="state.mode === 'net'" @click="state.mode = 'net'">
          {{ t("Net → gross") }}
        </button>
      </div>

      <SheetAmountInput
        v-if="state.mode === 'gross'"
        v-model="state.gross"
        label="Gross pay per month"
        :hint="t('Everything paid to you in cash that month: salary, vacation, travel, bonus.')"
      />
      <SheetAmountInput v-else v-model="state.net" label="Take-home you want per month" />

      <button v-if="latest" type="button" class="btn btn-sm sal-fill" @click="fillFromPayslip">
        🧾 {{ t("Fill from my latest payslip") }} · {{ latestMonth }}
      </button>
      <div v-if="ytdAvailable" class="sal-ytd">
        <div class="seg" role="tablist" :aria-label="t('How tax is counted')">
          <button type="button" role="tab" class="seg-btn" :class="{ 'seg-btn--on': !usingYearToDate }" :aria-selected="!usingYearToDate" @click="state.ytdOn = 0">
            {{ t("Every month") }}
          </button>
          <button type="button" role="tab" class="seg-btn" :class="{ 'seg-btn--on': usingYearToDate }" :aria-selected="usingYearToDate" @click="state.ytdOn = 1">
            {{ t("This month, with the year so far") }}
          </button>
        </div>
        <p class="sal-note">
          {{ usingYearToDate
            ? t("Tax for this one month, counted with what you already earned this year: it differs from a steady month.")
            : t("As if this salary were paid every month, the year so far ignored.") }}
        </p>
      </div>
      <p v-if="filled" class="sal-note">{{ t("Taken from the {month} payslip; the result is for the month after it.", { month: latestMonth }) }}</p>

      <section v-if="result" class="sal-result" aria-live="polite">
        <p class="sal-label">{{ state.mode === "net" ? t("Gross pay needed") : t("You take home") }}</p>
        <p class="sal-big">{{ formatIls(state.mode === "net" ? result.gross : result.net) }}</p>
        <p v-if="state.mode === 'net'" class="sal-sub-big">{{ t("You take home") }} {{ formatIls(result.net) }}</p>

        <div class="sal-bar" role="img" :aria-label="t('Where the gross pay goes')">
          <span v-for="part in split" :key="part.key" :class="['sal-bar__part', `sal-bar__part--${part.key}`]" :style="{ flexGrow: part.amount }" />
        </div>
        <ul class="sal-legend">
          <li v-for="part in split" :key="part.key">
            <span :class="['sal-dot', `sal-bar__part--${part.key}`]" aria-hidden="true" />{{ part.label }} <strong>{{ part.pct }}%</strong>
          </li>
        </ul>

        <ul class="sal-rows">
          <li class="sal-row"><span>{{ t("Gross pay per month") }}</span><strong>{{ formatIls(result.gross) }}</strong></li>
          <li v-for="row in rows" :key="row.key" class="sal-row sal-row--minus">
            <span>{{ row.label }}</span><strong>− {{ formatIls(row.amount) }}</strong>
          </li>
          <li class="sal-row sal-row--total"><span>{{ t("Total deductions") }}</span><strong>− {{ formatIls(result.totalDeductions) }}</strong></li>
        </ul>

        <p class="sal-fact">{{ t("Of each ₪1,000 gross, on average, you keep about {amount}", { amount: formatIlsWhole(keepOfEachThousand) }) }}</p>
        <p class="sal-fact">{{ t("Of each extra ₪1,000 gross you keep about {amount}", { amount: formatIlsWhole(keepOfThousand) }) }}</p>
        <p class="sal-fact">{{ t("Income tax, National Insurance and health tax take {pct}% of the gross pay", { pct: Math.round(result.taxShare * 100) }) }}</p>

        <div v-if="result.employer.pension + result.employer.severance + result.employer.studyFund > 0" class="sal-employer">
          <p class="sal-sub">{{ t("Employer also pays") }}</p>
          <ul class="sal-rows">
            <li v-if="result.employer.pension > 0" class="sal-row"><span>{{ t("Pension") }}</span><strong>{{ formatIls(result.employer.pension) }}</strong></li>
            <li v-if="result.employer.severance > 0" class="sal-row"><span>{{ t("Severance") }}</span><strong>{{ formatIls(result.employer.severance) }}</strong></li>
            <li v-if="result.employer.studyFund > 0" class="sal-row"><span>{{ t("Study fund") }}</span><strong>{{ formatIls(result.employer.studyFund) }}</strong></li>
          </ul>
        </div>
      </section>
      <p v-else-if="state.mode === 'net' && state.net > 0" class="sal-warn">{{ t("That take-home can't be reached") }}</p>

      <details ref="details" class="sal-details">
        <summary>{{ t("Your details") }}</summary>
        <div v-if="!editing" class="sal-view">
          <ul class="sal-rows">
            <li v-for="row in summaryRows" :key="row.label" class="sal-row">
              <span>{{ t(row.label) }}</span><strong>{{ row.value }}</strong>
            </li>
          </ul>
          <p class="sal-note">{{ ratesFromPayslip ? t("Rates as your payslip applies them.") : t("Usual rates; fill from your payslip for yours.") }}</p>
          <div class="sal-view-actions">
            <button type="button" class="btn btn-sm" @click="editing = true">✎ {{ t("Edit") }}</button>
            <button v-if="latest" type="button" class="btn btn-sm" @click="fillFromPayslip">
              🧾 {{ t("Restore the numbers from the payslip") }} · {{ latestMonth }}
            </button>
          </div>
        </div>
        <div v-else class="sal-fields">
          <SheetAmountInput v-model="state.benefits" label="Taxable perks, not paid in cash (meals…)" />
          <SheetAmountInput
            v-model="state.pensionBase"
            label="Salary the pension is based on"
            :hint="t('Leave 0 if it is the same as the gross pay.')"
          />
          <SheetAmountInput
            v-model="state.studyFundBase"
            label="Salary the study fund is based on"
            :hint="t('0 if you have none.')"
          />
          <p class="sal-sub">{{ t("Fund rates, %") }}</p>
          <div class="sal-rates">
            <label v-for="f in rateFields" :key="f.key" class="sheet-field">
              <span class="sheet-field__label">{{ t(f.label) }}</span>
              <input v-model.number="state[f.key]" class="input" type="number" inputmode="decimal" step="0.01" min="0" max="30" />
            </label>
          </div>
          <label class="sheet-field">
            <span class="sheet-field__label">{{ t("Credit points") }}</span>
            <input v-model.number="state.creditPoints" class="input" type="number" inputmode="decimal" step="0.25" min="0" />
          </label>
          <p class="sal-sub">{{ t("Year to date (optional)") }}</p>
          <label class="sheet-field">
            <span class="sheet-field__label">{{ t("Months already paid this year") }}</span>
            <input v-model.number="state.ytdMonths" class="input" type="number" inputmode="numeric" step="1" min="0" max="11" />
          </label>
          <SheetAmountInput v-model="state.ytdTaxable" label="Taxable income so far" />
          <SheetAmountInput
            v-model="state.ytdTax"
            label="Income tax withheld so far"
            :hint="t('Both are in the cumulative columns of your last payslip.')"
          />
          <p v-if="ytdIncomplete" class="sal-warn">{{ t("Fill in the taxable income too, or set the months to 0: until then the year is ignored.") }}</p>
          <div class="sal-view-actions">
            <button type="button" class="btn btn-sm btn-primary" @click="editing = false">{{ t("Done") }}</button>
            <button v-if="latest" type="button" class="btn btn-sm" @click="fillFromPayslip">
              🧾 {{ t("Restore the numbers from the payslip") }} · {{ latestMonth }}
            </button>
          </div>
        </div>
      </details>


      <p class="sal-note">
        {{ usingYearToDate
          ? t("Counted with your year to date, the way the payslip does.")
          : t("A steady-month estimate. The payslip works tax out on the whole year so far, so in a month with a bonus, vacation pay-out or new tax brackets it can differ by a few hundred shekels. Fill in the year to date for the exact figure.") }}
      </p>
      <p class="sal-note">{{ t("2026 rates, including the March bracket update. Not covered: tax-free ceilings on perks, several employers, special credits.") }}</p>
    </div>
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { dateTag, t } from "@/shared/i18n";
import { fetchPayslips } from "@/shared/api/client";
import { useAuthStore } from "@/shared/stores/auth";
import SheetAmountInput from "@/shared/components/SheetAmountInput.vue";
import BottomSheet from "@/shared/components/BottomSheet.vue";
import { formatIls, formatIlsWhole } from "@/shared/utils/format";
import {
  DEFAULT_CREDIT_POINTS,
  DEFAULT_PENSION_EMPLOYEE_RATE,
  DEFAULT_PENSION_EMPLOYER_RATE,
  DEFAULT_SEVERANCE_RATE,
  DEFAULT_STUDY_FUND_EMPLOYEE_RATE,
  DEFAULT_STUDY_FUND_EMPLOYER_RATE,
  computeSalary,
  grossForNet,
  type SalaryInput,
} from "@core/salary/salaryCalc";
import { fundRatesFromPayslip, yearToDateFromPayslip, type Payslip } from "@core/salary/payslip";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

// What you type stays on this device only (the numbers are personal and the site is public).
const STORAGE_KEY = "finance_salary_calc_v1";

interface Saved {
  mode: "gross" | "net";
  gross: number;
  net: number;
  benefits: number;
  pensionBase: number;
  studyFundBase: number;
  creditPoints: number;
  ytdMonths: number;
  ytdTaxable: number;
  ytdTax: number;
  /** 1 = count tax with the year so far (this one month); 0 = as if the salary were steady. */
  ytdOn: number;
  /** Fund rates in percent (6 = 6%). */
  pensionEmployeePct: number;
  pensionEmployerPct: number;
  severancePct: number;
  studyFundEmployeePct: number;
  studyFundEmployerPct: number;
  /** 1 when the rates came from a payslip, 0 for the usual ones. */
  ratesFromPayslip: number;
}

const DEFAULTS: Saved = {
  mode: "gross",
  gross: 15000,
  net: 12000,
  benefits: 0,
  pensionBase: 0,
  studyFundBase: 0,
  creditPoints: DEFAULT_CREDIT_POINTS,
  ytdMonths: 0,
  ytdTaxable: 0,
  ytdTax: 0,
  ytdOn: 0,
  pensionEmployeePct: Math.round(DEFAULT_PENSION_EMPLOYEE_RATE * 10000) / 100,
  pensionEmployerPct: Math.round(DEFAULT_PENSION_EMPLOYER_RATE * 10000) / 100,
  severancePct: Math.round(DEFAULT_SEVERANCE_RATE * 10000) / 100,
  studyFundEmployeePct: Math.round(DEFAULT_STUDY_FUND_EMPLOYEE_RATE * 10000) / 100,
  studyFundEmployerPct: Math.round(DEFAULT_STUDY_FUND_EMPLOYER_RATE * 10000) / 100,
  ratesFromPayslip: 0,
};

function load(): Saved {
  const out: Saved = { ...DEFAULTS };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Saved> | null;
    if (raw && typeof raw === "object") {
      if (raw.mode === "gross" || raw.mode === "net") out.mode = raw.mode;
      for (const key of Object.keys(DEFAULTS) as (keyof Saved)[]) {
        if (key === "mode") continue;
        const v = raw[key];
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) (out[key] as number) = v;
      }
    }
  } catch {
    /* private mode or bad data: start from the defaults */
  }
  return out;
}

const state = reactive<Saved>(load());

watch(
  state,
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* private mode */
    }
  },
  { deep: true },
);

const auth = useAuthStore();
const details = ref<HTMLDetailsElement | null>(null);
// The details open read-only; the fields appear only after "Edit", so a stray tap cannot wipe a number.
const editing = ref(false);
const latest = ref<Payslip | null>(null);
const filled = ref(false);
let payslipsTried = false;

// Your own payslips are private (Egor only); when they are there, the details can come from the latest one.
watch(
  () => props.open,
  async (open) => {
    if (!open || payslipsTried || auth.isDemo || !auth.canEditBudget) return;
    payslipsTried = true;
    try {
      latest.value = (await fetchPayslips(auth.token || undefined)).payslips[0] ?? null;
    } catch {
      latest.value = null;
    }
  },
);

const latestMonth = computed(() => {
  const p = latest.value;
  if (!p) return "";
  const label = new Date(p.year, p.month - 1, 1).toLocaleDateString(dateTag(), { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
});

let filling = false;
function fillFromPayslip() {
  const p = latest.value;
  if (!p) return;
  filling = true;
  setTimeout(() => (filling = false));
  const ytd = yearToDateFromPayslip(p);
  state.mode = "gross";
  state.gross = Math.round(p.totals.gross);
  state.benefits = p.tax.benefitMonth ?? 0;
  state.pensionBase = p.deposits.pensionBase ?? 0;
  state.studyFundBase = p.deposits.studyFundBase ?? 0;
  state.creditPoints = p.tax.creditPoints ?? DEFAULT_CREDIT_POINTS;
  state.ytdMonths = ytd?.months ?? 0;
  state.ytdTaxable = ytd?.taxable ?? 0;
  state.ytdTax = ytd?.taxPaid ?? 0;
  const rates = fundRatesFromPayslip(p);
  const asPct = (x: number | null, fallback: number) => (x == null ? fallback : Math.round(x * 10000) / 100);
  state.pensionEmployeePct = asPct(rates.pensionEmployee, DEFAULTS.pensionEmployeePct);
  state.pensionEmployerPct = asPct(rates.pensionEmployer, DEFAULTS.pensionEmployerPct);
  state.severancePct = asPct(rates.severance, DEFAULTS.severancePct);
  state.studyFundEmployeePct = asPct(rates.studyFundEmployee, DEFAULTS.studyFundEmployeePct);
  state.studyFundEmployerPct = asPct(rates.studyFundEmployer, DEFAULTS.studyFundEmployerPct);
  state.ratesFromPayslip = 1;
  filled.value = true;
  if (details.value) details.value.open = true;
}

// A year to date needs all three numbers; with months but no income it would be counted as "ten months of nothing".
const ytdAvailable = computed(() => state.ytdMonths > 0 && state.ytdTaxable > 0);
const usingYearToDate = computed(() => ytdAvailable.value && state.ytdOn === 1);
const ytdIncomplete = computed(() => state.ytdMonths > 0 && state.ytdTaxable <= 0);

const baseInput = computed((): Omit<SalaryInput, "gross"> => ({
  benefits: state.benefits,
  creditPoints: state.creditPoints,
  pensionBase: state.pensionBase > 0 ? state.pensionBase : null,
  studyFundBase: state.studyFundBase,
  pensionEmployeeRate: state.pensionEmployeePct / 100,
  pensionEmployerRate: state.pensionEmployerPct / 100,
  severanceRate: state.severancePct / 100,
  studyFundEmployeeRate: state.studyFundEmployeePct / 100,
  studyFundEmployerRate: state.studyFundEmployerPct / 100,
  yearToDate: usingYearToDate.value
    ? { months: Math.min(11, Math.floor(state.ytdMonths)), taxable: state.ytdTaxable, taxPaid: state.ytdTax }
    : null,
}));

const grossUsed = computed(() => (state.mode === "gross" ? state.gross : grossForNet(state.net, baseInput.value)));

const result = computed(() => {
  const gross = grossUsed.value;
  return gross && gross > 0 ? computeSalary({ ...baseInput.value, gross }) : null;
});

const rows = computed(() => {
  const r = result.value;
  if (!r) return [];
  const list = [
    { key: "tax", label: t("Income tax"), amount: r.incomeTax },
    { key: "ni", label: t("National Insurance"), amount: r.nationalInsurance },
    { key: "health", label: t("Health tax"), amount: r.healthTax },
    { key: "pension", label: t("Pension (you)"), amount: r.pension },
  ];
  if (r.studyFund > 0 || state.studyFundBase > 0) list.push({ key: "study", label: t("Study fund (you)"), amount: r.studyFund });
  return list;
});

const summaryRows = computed(() => {
  const money = (x: number) => (x > 0 ? formatIlsWhole(x) : "—");
  return [
    { label: "Taxable perks, not paid in cash (meals…)", value: money(state.benefits) },
    { label: "Salary the pension is based on", value: state.pensionBase > 0 ? formatIlsWhole(state.pensionBase) : t("same as gross pay") },
    { label: "Salary the study fund is based on", value: money(state.studyFundBase) },
    ...rateFields.map((f) => ({ label: f.label, value: `${state[f.key]}%` })),
    { label: "Credit points", value: String(state.creditPoints) },
    { label: "Months already paid this year", value: state.ytdMonths > 0 ? String(state.ytdMonths) : "—" },
    { label: "Taxable income so far", value: money(state.ytdTaxable) },
    { label: "Income tax withheld so far", value: money(state.ytdTax) },
  ];
});

type PctKey = "pensionEmployeePct" | "pensionEmployerPct" | "severancePct" | "studyFundEmployeePct" | "studyFundEmployerPct";
const rateFields: { key: PctKey; label: string }[] = [
  { key: "pensionEmployeePct", label: "Pension: you" },
  { key: "pensionEmployerPct", label: "Pension: employer" },
  { key: "severancePct", label: "Severance: employer" },
  { key: "studyFundEmployeePct", label: "Study fund: you" },
  { key: "studyFundEmployerPct", label: "Study fund: employer" },
];
const ratesFromPayslip = computed(() => state.ratesFromPayslip === 1);
// Typing a rate by hand makes it yours, no longer the payslip's.
watch(
  () => rateFields.map((f) => state[f.key]).join("|"),
  (_now, before) => {
    if (before !== undefined && !filling) state.ratesFromPayslip = 0;
  },
);

/** Gross pay split into take-home, taxes and your fund deposits (for the bar). */
const split = computed(() => {
  const r = result.value;
  if (!r || r.gross <= 0) return [];
  const parts = [
    { key: "net", label: t("Take-home"), amount: r.net },
    { key: "tax", label: t("Taxes"), amount: r.incomeTax + r.nationalInsurance + r.healthTax },
    { key: "funds", label: t("Pension and fund"), amount: r.pension + r.studyFund + r.otherDeductions },
  ].filter((x) => x.amount > 0);
  const total = parts.reduce((s, x) => s + x.amount, 0);
  return parts.map((x) => ({ ...x, pct: Math.round((x.amount / total) * 100) }));
});

/** The average: what stays in your pocket from each ₪1,000 of the whole gross pay. */
const keepOfEachThousand = computed(() => {
  const r = result.value;
  return r && r.gross > 0 ? (r.net / r.gross) * 1000 : 0;
});

/** What stays in your pocket from the next ₪1,000 of gross pay. */
const keepOfThousand = computed(() => {
  const r = result.value;
  if (!r) return 0;
  return computeSalary({ ...baseInput.value, gross: r.gross + 1000 }).net - r.net;
});
</script>

<style scoped>
.sal {
  display: grid;
  gap: 1rem;
}
.sal-head {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}
.sal-head-sub {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.sal-bar {
  display: flex;
  gap: 3px;
  height: 10px;
  margin-top: 0.8rem;
  border-radius: 999px;
  overflow: hidden;
}
.sal-bar__part {
  min-width: 4px;
  background: var(--text-faint);
}
.sal-bar__part--net {
  background: var(--success);
}
.sal-bar__part--tax {
  background: var(--danger);
}
.sal-bar__part--funds {
  background: var(--accent);
}
.sal-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1rem;
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.sal-legend li {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.sal-legend strong {
  color: var(--text);
  font-weight: 600;
}
.sal-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.sal-rates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: end;
  gap: 0.7rem;
}
.sal .seg {
  margin: 0;
}
.sal-details {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.6rem 0.9rem;
}
.sal-details > summary {
  cursor: pointer;
  font-weight: 650;
  min-height: 32px;
  display: flex;
  align-items: center;
}
.sal-details > summary::after {
  content: "›";
  margin-left: auto;
  font-size: 1.4rem;
  color: var(--text-muted);
  transition: transform 0.15s;
}
.sal-details[open] > summary::after {
  transform: rotate(90deg);
}
.sal-fields {
  display: grid;
  gap: 0.9rem;
  margin-top: 0.8rem;
}
.sal-fields :deep(.sheet-amount) {
  min-height: 56px;
}
.sal-fields :deep(.sheet-amount__input) {
  font-size: 1.15rem;
}
.sal-ytd {
  display: grid;
  gap: 0.5rem;
}
.sal-ytd .seg {
  margin: 0;
}
.sal-view-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.7rem;
}
.sal-fill {
  justify-self: start;
}
.sal-sub {
  margin: 0.4rem 0 0;
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--text-muted);
}
.sal-result {
  padding: 1rem;
  border-radius: 20px;
  background: var(--surface);
}
.sal-label {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--text-muted);
}
.sal-big {
  margin: 0.1rem 0 0;
  font-size: 2.1rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}
.sal-sub-big {
  margin: 0.1rem 0 0;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.sal-rows {
  list-style: none;
  margin: 0.9rem 0 0;
  padding: 0;
}
.sal-row {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.55rem 0;
  font-variant-numeric: tabular-nums;
}
.sal-row + .sal-row {
  border-top: 1px solid var(--border);
}
.sal-row--minus strong {
  font-weight: 600;
}
.sal-row--total {
  font-weight: 700;
}
.sal-fact {
  margin: 0.7rem 0 0;
  font-size: 0.9rem;
}
.sal-employer {
  margin-top: 0.9rem;
}
.sal-warn {
  margin: 0;
  color: var(--danger);
}
.sal-note {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-faint);
}
@media (min-width: 1024px) {
  .sal {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: 2rem;
    row-gap: 0;
  }
  .sal > * {
    grid-column: 1;
    margin-bottom: 1rem;
  }
  .sal > .sal-result {
    grid-column: 2;
    grid-row: 1 / span 12;
    align-self: start;
    position: sticky;
    top: 0;
    margin-bottom: 0;
  }
}
</style>
