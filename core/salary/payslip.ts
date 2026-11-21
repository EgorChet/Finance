/**
 * A payslip as data: what the PDF says, in a form the app can show in Russian or English.
 * Personal identifiers (ID number, bank account, tax file numbers) are never part of it.
 */

export type PaymentKind =
  | "base_salary"
  | "base_top_up"
  | "travel"
  | "vacation"
  | "recuperation"
  | "election_day"
  | "bonus"
  | "holidays"
  | "sick"
  | "reserve"
  | "overtime"
  | "meals_value"
  | "other";

export type DeductionKind = "income_tax" | "national_insurance" | "health_tax" | "pension" | "study_fund" | "other";

export type LeaveKind = "vacation" | "sick" | "reserve" | "recuperation" | "other";

export interface PayslipPayment {
  /** As printed (Hebrew). */
  description: string;
  kind: PaymentKind;
  quantity: number | null;
  rate: number | null;
  /** Taxable value for perks that are not paid out (meals); null otherwise. */
  taxableValue: number | null;
  /** Paid in cash; 0 for a perk. */
  amount: number;
  /** A perk counted for tax only (marked * on the payslip). */
  benefit: boolean;
}

export interface PayslipDeduction {
  label: string;
  kind: DeductionKind;
  amount: number;
  /** Mandatory and pension-type deductions vs. voluntary ones taken from the net. */
  voluntary: boolean;
}

export interface PayslipLeave {
  label: string;
  kind: LeaveKind;
  previous: number | null;
  added: number | null;
  used: number | null;
  balance: number | null;
}

export interface Payslip {
  /** "2026-10": the month the payslip is for. */
  id: string;
  year: number;
  month: number;
  employer: string;
  /** Date the payslip was printed (ISO). */
  printedAt: string | null;
  job: {
    startDate: string | null;
    seniorityYears: number | null;
    hoursWorked: number | null;
    hoursExpected: number | null;
    daysWorked: number | null;
    daysExpected: number | null;
    scopePercent: number | null;
    hourlyRate: number | null;
  };
  payments: PayslipPayment[];
  deductions: PayslipDeduction[];
  /** Income-tax bracket rate shown on the payslip, in percent. */
  marginalTaxRate: number | null;
  totals: {
    /** Total cash payments. */
    gross: number;
    /** Tax, insurance and pension/fund deductions. */
    mandatoryDeductions: number;
    voluntaryDeductions: number;
    net: number;
    netPayable: number;
  };
  /** Month and year-to-date figures the income tax is worked out from. */
  tax: {
    taxableMonth: number | null;
    taxableYtd: number | null;
    benefitMonth: number | null;
    benefitYtd: number | null;
    insuranceBaseMonth: number | null;
    creditPoints: number | null;
    creditPointsValueMonth: number | null;
    pensionCreditMonth: number | null;
    incomeTaxYtd: number | null;
    nationalInsuranceYtd: number | null;
    healthTaxYtd: number | null;
    /** Months the cumulative calculation covers. */
    monthsInCalculation: number | null;
  };
  deposits: {
    insuredSalary: number | null;
    pensionBase: number | null;
    pensionEmployer: number | null;
    severance: number | null;
    studyFundBase: number | null;
    studyFundEmployer: number | null;
  };
  leave: PayslipLeave[];
  /** Where the original PDF is kept and which page of it (set by the storage layer). */
  pdfPath?: string;
  pdfPage?: number;
}

// ── Labels ────────────────────────────────────────────────────────────────────────────

export type PayslipLocale = "ru" | "en";

const PAYMENT_RULES: [RegExp, PaymentKind][] = [
  [/השלמת? (שכר )?יסוד|השלמה/, "base_top_up"],
  [/שכר יסוד|משכורת|שכר חודשי/, "base_salary"],
  [/נסיעות/, "travel"],
  [/הבראה/, "recuperation"],
  [/חופשה/, "vacation"],
  [/יום בחירות/, "election_day"],
  [/בונוס|מענק|פרמיה/, "bonus"],
  [/שווי ארוחות|ארוחות/, "meals_value"],
  [/חגים|חג/, "holidays"],
  [/מחלה/, "sick"],
  [/מילואים/, "reserve"],
  [/נוספות/, "overtime"],
];

export function classifyPayment(description: string): PaymentKind {
  const text = description.replace(/^\*\s*/, "").trim();
  for (const [re, kind] of PAYMENT_RULES) if (re.test(text)) return kind;
  return "other";
}

export function classifyDeduction(label: string): DeductionKind {
  if (/הכנסה/.test(label)) return "income_tax";
  if (/לאומי/.test(label)) return "national_insurance";
  if (/בריאות/.test(label)) return "health_tax";
  if (/השתלמות/.test(label)) return "study_fund";
  if (/פנסיה|גמל|קצבה|ביטוח מנהלים/.test(label)) return "pension";
  return "other";
}

export function classifyLeave(label: string): LeaveKind {
  if (/חופשה/.test(label)) return "vacation";
  if (/מחלה/.test(label)) return "sick";
  if (/מילואים/.test(label)) return "reserve";
  if (/הבראה/.test(label)) return "recuperation";
  return "other";
}

const PAYMENT_LABELS: Record<PaymentKind, { en: string; ru: string }> = {
  base_salary: { en: "Base salary", ru: "Оклад" },
  base_top_up: { en: "Base salary top-up", ru: "Доплата к окладу" },
  travel: { en: "Travel", ru: "Проезд" },
  vacation: { en: "Vacation pay", ru: "Отпускные" },
  recuperation: { en: "Recuperation pay (havra'a)", ru: "Оздоровительные (хавраа)" },
  election_day: { en: "Election day pay", ru: "Оплата дня выборов" },
  bonus: { en: "Bonus", ru: "Премия" },
  holidays: { en: "Holiday pay", ru: "Оплата праздников" },
  sick: { en: "Sick pay", ru: "Больничные" },
  reserve: { en: "Reserve duty", ru: "Милуим" },
  overtime: { en: "Overtime", ru: "Сверхурочные" },
  meals_value: { en: "Meals (taxable perk)", ru: "Питание (облагаемая льгота)" },
  other: { en: "Other", ru: "Прочее" },
};

const DEDUCTION_LABELS: Record<DeductionKind, { en: string; ru: string }> = {
  income_tax: { en: "Income tax", ru: "Подоходный налог" },
  national_insurance: { en: "National Insurance", ru: "Национальное страхование" },
  health_tax: { en: "Health tax", ru: "Налог на здравоохранение" },
  pension: { en: "Pension", ru: "Пенсия" },
  study_fund: { en: "Study fund (Keren Hishtalmut)", ru: "Керен иштальмут" },
  other: { en: "Other deduction", ru: "Прочий вычет" },
};

const LEAVE_LABELS: Record<LeaveKind, { en: string; ru: string }> = {
  vacation: { en: "Vacation", ru: "Отпуск" },
  sick: { en: "Sick leave", ru: "Больничные" },
  reserve: { en: "Reserve duty", ru: "Милуим" },
  recuperation: { en: "Recuperation (havra'a)", ru: "Оздоровительные (хавраа)" },
  other: { en: "Other", ru: "Прочее" },
};

/** A kind's name alone ("Other" for unknown ones), for screens that show the Hebrew next to it anyway. */
export function paymentKindLabel(kind: PaymentKind, locale: PayslipLocale): string {
  return PAYMENT_LABELS[kind][locale];
}
export function deductionKindLabel(kind: DeductionKind, locale: PayslipLocale): string {
  return DEDUCTION_LABELS[kind][locale];
}
export function leaveKindLabel(kind: LeaveKind, locale: PayslipLocale): string {
  return LEAVE_LABELS[kind][locale];
}

/** A payment's description as printed, without the "*" that marks a perk. */
export function paymentHebrew(p: PayslipPayment): string {
  return p.description.replace(/^\*\s*/, "").trim();
}

/**
 * Labels as printed on the payslip (the "Trio" template) for the fields that are read by position and so
 * have no stored text of their own. The same headings the parser anchors to.
 */
export const PAYSLIP_HEBREW = {
  title: "תלוש משכורת",
  payments: "תשלומים",
  deductions: "ניכויים",
  grossTotal: 'סה"כ תשלומים',
  mandatoryDeductions: "ניכויי חובה וגמל",
  voluntaryDeductions: "ניכויי רשות",
  net: "שכר נטו",
  netPayable: "נטו לתשלום",
  deposits: "הפקדות מעסיק לקופות גמל",
  fundBase: "שכר לגמל",
  employerContribution: "תגמולים",
  severance: "פיצויים",
  insuredSalary: "משכורת מבוטחת",
  taxable: 'חייב מ"ה',
  benefit: "שווי למס",
  insuranceBase: 'חייב ב"ל',
  creditPointsValue: 'ערך נ"ז',
  pensionCredit: "זיכוי גמל",
  incomeTax: "מס הכנסה",
  nationalInsurance: "ביטוח לאומי",
  healthTax: "בריאות",
  creditPoints: 'נ"ז',
  monthsInCalculation: "חודשי עבודה",
  marginalRate: "שולי%",
  startDate: "תחילת עבודה",
  seniority: "שנות ותק",
  hours: "ש' עבודה",
  days: "ימי עבודה",
  scope: "היקף משרה",
} as const;

/** A payment's name in the chosen language; unknown ones keep the Hebrew as printed. */
export function paymentLabel(p: PayslipPayment, locale: PayslipLocale): string {
  return p.kind === "other" ? p.description.replace(/^\*\s*/, "") : PAYMENT_LABELS[p.kind][locale];
}

export function deductionLabel(d: PayslipDeduction, locale: PayslipLocale): string {
  return d.kind === "other" ? d.label : DEDUCTION_LABELS[d.kind][locale];
}

export function leaveLabel(l: PayslipLeave, locale: PayslipLocale): string {
  return l.kind === "other" ? l.label : LEAVE_LABELS[l.kind][locale];
}

/** The cumulative figures of a payslip in the shape the salary calculator takes as "year to date". */
export function yearToDateFromPayslip(p: Payslip): { months: number; taxable: number; taxPaid: number } | null {
  const months = p.tax.monthsInCalculation;
  const taxable = p.tax.taxableYtd;
  const taxPaid = p.tax.incomeTaxYtd;
  if (months == null || taxable == null || taxPaid == null || months < 1 || months > 11) return null;
  return { months, taxable, taxPaid };
}
