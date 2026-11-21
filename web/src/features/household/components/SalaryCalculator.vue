<template>
  <SheetEditor
    :open="open"
    title="Salary calculator"
    subtitle="From gross pay to take-home, the way a payslip works it out"
    save-label="Done"
    @save="emit('close')"
    @cancel="emit('close')"
  >
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
      <p v-if="filled" class="sal-note">{{ t("Taken from the {month} payslip; the result is for the month after it.", { month: latestMonth }) }}</p>

      <details ref="details" class="sal-details">
        <summary>{{ t("Your details") }}</summary>
        <div class="sal-fields">
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
        </div>
      </details>

      <section v-if="result" class="sal-result" aria-live="polite">
        <p class="sal-label">{{ state.mode === "net" ? t("Gross pay needed") : t("You take home") }}</p>
        <p class="sal-big">{{ formatIls(state.mode === "net" ? result.gross : result.net) }}</p>
        <p v-if="state.mode === 'net'" class="sal-sub-big">{{ t("You take home") }} {{ formatIls(result.net) }}</p>

        <ul class="sal-rows">
          <li class="sal-row"><span>{{ t("Gross pay per month") }}</span><strong>{{ formatIls(result.gross) }}</strong></li>
          <li v-for="row in rows" :key="row.key" class="sal-row sal-row--minus">
            <span>{{ row.label }}</span><strong>− {{ formatIls(row.amount) }}</strong>
          </li>
          <li class="sal-row sal-row--total"><span>{{ t("Total deductions") }}</span><strong>− {{ formatIls(result.totalDeductions) }}</strong></li>
        </ul>

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

      <p class="sal-note">
        {{ usingYearToDate
          ? t("Counted with your year to date, the way the payslip does.")
          : t("A steady-month estimate. The payslip works tax out on the whole year so far, so in a month with a bonus, vacation pay-out or new tax brackets it can differ by a few hundred shekels. Fill in the year to date for the exact figure.") }}
      </p>
      <p class="sal-note">{{ t("2026 rates, including the March bracket update. Not covered: tax-free ceilings on perks, several employers, special credits.") }}</p>
    </div>
  </SheetEditor>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { dateTag, t } from "@/shared/i18n";
import { fetchPayslips } from "@/shared/api/client";
import { useAuthStore } from "@/shared/stores/auth";
import SheetAmountInput from "@/shared/components/SheetAmountInput.vue";
import SheetEditor from "@/shared/components/SheetEditor.vue";
import { formatIls, formatIlsWhole } from "@/shared/utils/format";
import { DEFAULT_CREDIT_POINTS, computeSalary, grossForNet, type SalaryInput } from "@core/salary/salaryCalc";
import { yearToDateFromPayslip, type Payslip } from "@core/salary/payslip";

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

function fillFromPayslip() {
  const p = latest.value;
  if (!p) return;
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
  filled.value = true;
  if (details.value) details.value.open = true;
}

const usingYearToDate = computed(() => state.ytdMonths > 0);

const baseInput = computed((): Omit<SalaryInput, "gross"> => ({
  benefits: state.benefits,
  creditPoints: state.creditPoints,
  pensionBase: state.pensionBase > 0 ? state.pensionBase : null,
  studyFundBase: state.studyFundBase,
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
  if (r.studyFund > 0) list.push({ key: "study", label: t("Study fund (you)"), amount: r.studyFund });
  return list;
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
</style>
