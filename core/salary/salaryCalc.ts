/**
 * Salary calculator: monthly gross → take-home for an Israeli employee, the way a payroll
 * department does it (not the way online calculators approximate it).
 *
 * What it models, checked line by line against real 2026 payslips (kept out of this repo):
 * - Income tax is CUMULATIVE ("מצטבר"): each month the tax on the whole year so far is worked
 *   out with the brackets scaled by the number of months, minus the credits for those months,
 *   minus the tax already withheld. A steady salary gives the same figure every month; an odd
 *   month (bonus, vacation pay-out) is smoothed over the year, which is why a single payslip
 *   can differ from a one-month calculator by a few hundred shekels.
 * - The brackets were widened retroactively in March 2026 (20% up to ₪19,000, 31% up to ₪25,100):
 *   payroll software applied the new brackets from the April payslip and refunded January–March.
 * - National Insurance and health tax use the same base as income tax (pay plus taxable perks such
 *   as meals) at a reduced rate up to a threshold and a full rate above it; both are rounded to
 *   whole shekels on the payslip.
 * - Pension: the employee's share is a percentage of the salary insured for pension, which can be
 *   lower than the salary; 35% of it, up to a monthly cap, comes back as a tax credit (section 45A).
 * - Study fund (Keren Hishtalmut) deposits are taken after tax and give no credit.
 *
 * Tax law figures are public. The maximum insured income for National Insurance is NOT confirmed
 * by any payslip (a salary that high doesn't appear in them): check it before trusting very high salaries.
 */

export interface TaxBracket {
  /** Monthly upper limit in shekels (Infinity for the last one). */
  upTo: number;
  rate: number;
}

export interface SalaryLaw {
  label: string;
  /** Income tax brackets per month; the annual limits are these × 12. */
  brackets: TaxBracket[];
  /** Tax credit per credit point per month. */
  creditPointValue: number;
  /** National Insurance / health: reduced rate up to this monthly amount, full rate above. */
  insuranceThreshold: number;
  /** Maximum monthly income National Insurance and health are charged on. */
  insuranceMax: number;
  /** Employee National Insurance: [reduced, full]. */
  nationalInsuranceRates: [number, number];
  /** Employee health tax: [reduced, full]. */
  healthRates: [number, number];
  /** Share of the employee's pension deposit that comes back as a tax credit. */
  pensionCreditRate: number;
  /** Largest monthly pension deposit that earns that credit. */
  pensionCreditCap: number;
}

/** Brackets in force since the March 2026 amendment (retroactive to 1 January 2026). */
export const LAW_2026: SalaryLaw = {
  label: "2026",
  brackets: [
    { upTo: 7010, rate: 0.1 },
    { upTo: 10060, rate: 0.14 },
    { upTo: 19000, rate: 0.2 },
    { upTo: 25100, rate: 0.31 },
    { upTo: 46690, rate: 0.35 },
    { upTo: 60130, rate: 0.47 },
    // 47% plus the 3% surtax on annual income above ₪721,560.
    { upTo: Number.POSITIVE_INFINITY, rate: 0.5 },
  ],
  creditPointValue: 242,
  insuranceThreshold: 7703,
  insuranceMax: 51910,
  nationalInsuranceRates: [0.0104, 0.07],
  healthRates: [0.0323, 0.0517],
  pensionCreditRate: 0.35,
  pensionCreditCap: 679,
};

/** The 2026 brackets as payroll software had them before the amendment (January–March payslips). */
export const LAW_2026_BEFORE_AMENDMENT: SalaryLaw = {
  ...LAW_2026,
  label: "2026 (before the March amendment)",
  brackets: LAW_2026.brackets.map((b) =>
    b.upTo === 19000 ? { ...b, upTo: 16150 } : b.upTo === 25100 ? { ...b, upTo: 22440 } : b,
  ),
};

export interface SalaryInput {
  /** Everything paid in cash this month: salary, vacation, travel, bonus… (the payslip's "total payments"). */
  gross: number;
  /** Taxable perks that are not paid out, e.g. meals. They add to the tax base only. */
  benefits?: number;
  creditPoints?: number;
  /** Salary the pension is calculated on; null/undefined = the gross. */
  pensionBase?: number | null;
  /** Salary the study fund is calculated on; 0 = no study fund. */
  studyFundBase?: number;
  pensionEmployeeRate?: number;
  pensionEmployerRate?: number;
  severanceRate?: number;
  studyFundEmployeeRate?: number;
  studyFundEmployerRate?: number;
  /** Other deductions taken from the net (loans, union fees…). */
  otherDeductions?: number;
  /** Earlier months of the same tax year, from the last payslip's cumulative columns. */
  yearToDate?: { months: number; taxable: number; taxPaid: number } | null;
}

export interface SalaryResult {
  gross: number;
  benefits: number;
  /** Income tax base for the month: gross + benefits. */
  taxable: number;
  incomeTax: number;
  nationalInsurance: number;
  healthTax: number;
  pension: number;
  studyFund: number;
  otherDeductions: number;
  totalDeductions: number;
  net: number;
  /** Tax credits used this month: credit points + pension credit. */
  creditsPerMonth: number;
  /** Income-tax bracket rate that the next shekel earned falls into. */
  marginalIncomeTaxRate: number;
  /** (income tax + National Insurance + health) ÷ gross. */
  taxShare: number;
  /** What the employer pays on top, per month. */
  employer: { pension: number; severance: number; studyFund: number };
}

export const DEFAULT_PENSION_EMPLOYEE_RATE = 0.06;
export const DEFAULT_PENSION_EMPLOYER_RATE = 0.065;
export const DEFAULT_SEVERANCE_RATE = 0.06;
export const DEFAULT_STUDY_FUND_EMPLOYEE_RATE = 0.025;
export const DEFAULT_STUDY_FUND_EMPLOYER_RATE = 0.075;
export const DEFAULT_CREDIT_POINTS = 2.25;

function round2(x: number): number {
  const r = Math.round((x + Number.EPSILON) * 100) / 100;
  return r === 0 ? 0 : r;
}

function clean(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

/** Bracket tax on `income`, with the monthly brackets scaled by `months`. No credits. */
export function bracketTax(income: number, months: number, law: SalaryLaw): number {
  let tax = 0;
  let prev = 0;
  for (const b of law.brackets) {
    const limit = b.upTo * months;
    if (income > prev) tax += (Math.min(income, limit) - prev) * b.rate;
    if (income <= limit) break;
    prev = limit;
  }
  return tax;
}

export function marginalRate(income: number, months: number, law: SalaryLaw): number {
  for (const b of law.brackets) if (income <= b.upTo * months) return b.rate;
  return law.brackets[law.brackets.length - 1].rate;
}

function twoRates(base: number, threshold: number, [low, high]: [number, number]): number {
  return low * Math.min(base, threshold) + high * Math.max(0, base - threshold);
}

export function computeSalary(input: SalaryInput, law: SalaryLaw = LAW_2026): SalaryResult {
  const gross = clean(input.gross);
  const benefits = clean(input.benefits);
  const taxable = gross + benefits;
  const points = input.creditPoints == null ? DEFAULT_CREDIT_POINTS : clean(input.creditPoints);

  const pensionBase = input.pensionBase == null ? gross : clean(input.pensionBase);
  const pension = round2(pensionBase * (input.pensionEmployeeRate ?? DEFAULT_PENSION_EMPLOYEE_RATE));
  const studyFundBase = clean(input.studyFundBase);
  const studyFund = round2(studyFundBase * (input.studyFundEmployeeRate ?? DEFAULT_STUDY_FUND_EMPLOYEE_RATE));
  const other = clean(input.otherDeductions);

  const pensionCredit = round2(law.pensionCreditRate * Math.min(pension, law.pensionCreditCap));
  const creditsPerMonth = round2(points * law.creditPointValue + pensionCredit);

  // Income tax on the whole year so far, minus what was already withheld.
  const ytd = input.yearToDate && input.yearToDate.months > 0 ? input.yearToDate : null;
  const months = (ytd ? Math.floor(ytd.months) : 0) + 1;
  const cumulativeTaxable = (ytd ? clean(ytd.taxable) : 0) + taxable;
  const cumulativeDue = Math.max(0, bracketTax(cumulativeTaxable, months, law) - creditsPerMonth * months);
  const incomeTax = round2(cumulativeDue - (ytd ? ytd.taxPaid : 0));

  const insured = Math.min(taxable, law.insuranceMax);
  const nationalInsurance = Math.round(twoRates(insured, law.insuranceThreshold, law.nationalInsuranceRates));
  const healthTax = Math.round(twoRates(insured, law.insuranceThreshold, law.healthRates));

  const totalDeductions = round2(incomeTax + nationalInsurance + healthTax + pension + studyFund + other);
  return {
    gross: round2(gross),
    benefits: round2(benefits),
    taxable: round2(taxable),
    incomeTax,
    nationalInsurance,
    healthTax,
    pension,
    studyFund,
    otherDeductions: round2(other),
    totalDeductions,
    net: round2(gross - totalDeductions),
    creditsPerMonth,
    marginalIncomeTaxRate: marginalRate(cumulativeTaxable, months, law),
    taxShare: gross > 0 ? (incomeTax + nationalInsurance + healthTax) / gross : 0,
    employer: {
      pension: round2(pensionBase * (input.pensionEmployerRate ?? DEFAULT_PENSION_EMPLOYER_RATE)),
      severance: round2(pensionBase * (input.severanceRate ?? DEFAULT_SEVERANCE_RATE)),
      studyFund: round2(studyFundBase * (input.studyFundEmployerRate ?? DEFAULT_STUDY_FUND_EMPLOYER_RATE)),
    },
  };
}

/**
 * The gross that leaves `targetNet` in hand, everything else as given. Returns null when the
 * target can't be reached (negative, or more than any realistic salary would leave).
 */
export function grossForNet(
  targetNet: number,
  input: Omit<SalaryInput, "gross">,
  law: SalaryLaw = LAW_2026,
): number | null {
  const target = clean(targetNet);
  if (target <= 0) return null;
  const netAt = (gross: number) => computeSalary({ ...input, gross }, law).net;
  let lo = target;
  let hi = Math.max(target * 3, 10000);
  if (netAt(hi) < target) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (netAt(mid) < target) lo = mid;
    else hi = mid;
  }
  return round2(hi);
}
