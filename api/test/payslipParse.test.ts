/**
 * Payslip parser on a synthetic page: the real template's geometry with invented numbers.
 * (The real payslips are personal and the repo is public; they were checked separately.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePayslipItems, type PdfTextItem } from "../../core/salary/payslipParse.js";
import { checkVacation } from "../../core/salary/payslipChecks.js";
import { deductionLabel, fundRatesFromPayslip, paymentLabel, savingsFromPayslips, yearToDateFromPayslip } from "../../core/salary/payslip.js";

const it = (x1: number, y: number, str: string): PdfTextItem => ({ str, x0: x1 - str.length * 5, x1, y });

function page(over: { net?: string } = {}): PdfTextItem[] {
  return [
    it(316, 16, "תלוש משכורת"), it(226, 16, "03/27"), it(565, 20, "חברת דוגמה בע\"מ"),
    it(160, 64, "תחילת עבודה:"), it(64, 64, "01/02/2020"),
    it(150, 88, "שנות ותק:"), it(34, 88, "1.50"),
    it(160, 104, "ש' עבודה:"), it(112, 104, "150.00"), it(44, 104, "176.00"),
    it(160, 116, "ימי עבודה:"), it(112, 116, "17.00"), it(44, 116, "21.00"),
    it(212, 140, "היקף משרה: %"), it(151, 144, "100.00"), it(72, 144, "90.00"),
    // payments
    it(539, 156, "תיאור תשלום"),
    it(563, 168, "שכר יסוד"), it(415, 168, "15,000.00"), it(246, 168, "15,000.00"),
    it(563, 180, "ª"), it(558, 180, "סיעות"), it(453, 180, "1.00"), it(415, 180, "100.00"), it(246, 180, "100.00"),
    it(564, 204, "* שווי ארוחות"), it(453, 204, "1.00"), it(415, 204, "600.00"), it(358, 204, "600.00"),
    // deductions (the insurance value sits slightly above its label, as on the real page)
    it(165, 172, "מס הכנסה שולי%"), it(94, 172, "20"), it(72, 172, "1,000.00"),
    it(164, 184, "ביטוח לאומי"), it(72, 180, "500.00"),
    it(165, 192, "מס בריאות"), it(72, 192, "400.00"),
    it(165, 220, "מגדל פנסיה"), it(71, 220, "800.00"),
    it(165, 228, "השתלמות אקסלנס"), it(71, 228, "250.00"),
    // employer deposits and totals
    it(520, 424, "הפקדות מעסיק לקופות גמל"),
    it(514, 432, "שכר לגמל"), it(472, 432, "תגמולים"), it(439, 432, "פיצויים"),
    it(162, 432, 'סה"כ תשלומים'), it(72, 432, "15,100.00"),
    it(559, 444, "מגדל פנסיה"), it(512, 444, "13,000.00"), it(470, 444, "845.00"), it(437, 444, "780.00"),
    it(156, 444, "יכויי חובה וגמל"), it(70, 444, "2,950.00"),
    it(559, 452, "השתלמות אקסלנס"), it(512, 452, "10,000.00"), it(470, 452, "750.00"),
    it(337, 452, "משכורת מבוטחת"), it(272, 452, "13,000.00"),
    it(161, 456, "שכר"), it(140, 456, "נ"), it(135, 456, "טו"), it(72, 456, over.net ?? "12,150.00"),
    it(158, 468, 'ס"ה'), it(138, 468, "ניכויי רשות"),
    it(160, 480, "נ"), it(156, 480, "טו לתשלום"), it(72, 480, over.net ?? "12,150.00"),
    // tax block
    it(554, 532, "שווי למס"), it(484, 532, "600.00"), it(416, 532, "1,800.00"),
    it(554, 556, 'חייב מ"ה'), it(484, 556, "15,700.00"), it(416, 556, "47,100.00"),
    it(554, 572, 'חייב ב"ל'), it(484, 572, "15,700.00"), it(416, 572, "47,100.00"),
    it(554, 580, 'ערך נ"ז'), it(554, 588, "זיכוי נוסף"), it(484, 584, "544.50"), it(416, 584, "1,633.50"),
    it(554, 596, "זיכוי גמל"), it(484, 600, "237.65"), it(416, 600, "712.95"),
    it(339, 520, "מס הכנסה"), it(288, 524, "3,000.00"),
    it(339, 528, "ביטוח לאומי"), it(288, 532, "1,500.00"),
    it(339, 540, "בריאות"), it(288, 540, "1,200.00"),
    it(340, 624, 'נ"ז'), it(288, 628, "2.25"),
    it(201, 632, "חודשי עבודה"), it(83, 652, "3"),
    // leave balances
    it(220, 536, "חופשה"), it(151, 536, "10.00"), it(116, 536, "1.00"), it(79, 536, "2.00"), it(46, 536, "9.00"),
    it(220, 548, "מחלה"), it(151, 548, "5.00"), it(116, 548, "1.50"), it(46, 548, "6.50"),
    it(504, 772, "05/03/27"),
  ];
}

test("reads every part of a payslip and finds no arithmetic warnings", () => {
  const { payslip: p, warnings } = parsePayslipItems(page());
  assert.deepEqual(warnings, []);
  assert.ok(p);
  assert.equal(p.id, "2027-03");
  assert.equal(p.employer, 'חברת דוגמה בע"מ');
  assert.equal(p.printedAt, "2027-03-05");
  assert.deepEqual(p.job, {
    startDate: "2020-02-01", seniorityYears: 1.5, hoursWorked: 150, hoursExpected: 176,
    daysWorked: 17, daysExpected: 21, scopePercent: 100, hourlyRate: 90,
  });
  // The letter that the PDF turns into "ª" is repaired, and split pieces are joined.
  assert.deepEqual(p.payments.map((x) => [x.description, x.kind, x.amount, x.benefit]), [
    ["שכר יסוד", "base_salary", 15000, false],
    ["נסיעות", "travel", 100, false],
    ["* שווי ארוחות", "meals_value", 0, true],
  ]);
  assert.equal(p.payments[2].taxableValue, 600);
  assert.deepEqual(p.deductions.map((d) => [d.kind, d.amount]), [
    ["income_tax", 1000], ["national_insurance", 500], ["health_tax", 400], ["pension", 800], ["study_fund", 250],
  ]);
  assert.equal(p.marginalTaxRate, 20);
  assert.deepEqual(p.totals, { gross: 15100, mandatoryDeductions: 2950, voluntaryDeductions: 0, net: 12150, netPayable: 12150 });
  assert.deepEqual(p.tax, {
    taxableMonth: 15700, taxableYtd: 47100, benefitMonth: 600, benefitYtd: 1800, insuranceBaseMonth: 15700,
    creditPoints: 2.25, creditPointsValueMonth: 544.5, pensionCreditMonth: 237.65,
    incomeTaxYtd: 3000, nationalInsuranceYtd: 1500, healthTaxYtd: 1200, monthsInCalculation: 3,
  });
  assert.deepEqual(p.deposits, {
    insuredSalary: 13000, pensionBase: 13000, pensionEmployer: 845, severance: 780, studyFundBase: 10000, studyFundEmployer: 750,
  });
  assert.deepEqual(p.leave.map((l) => [l.kind, l.previous, l.added, l.used, l.balance]), [
    ["vacation", 10, 1, 2, 9],
    ["sick", 5, 1.5, null, 6.5],
  ]);
});

test("a page that doesn't add up is flagged instead of trusted", () => {
  const { payslip, warnings } = parsePayslipItems(page({ net: "12,000.00" }));
  assert.ok(payslip);
  assert.ok(warnings.some((w) => /net/i.test(w)), JSON.stringify(warnings));
});

test("a page that isn't a payslip gives nothing", () => {
  const { payslip, warnings } = parsePayslipItems([it(300, 100, "hello")]);
  assert.equal(payslip, null);
  assert.equal(warnings.length, 1);
});

test("labels come in Russian and English, unknown ones keep the Hebrew; year to date feeds the calculator", () => {
  const { payslip: p } = parsePayslipItems(page());
  assert.ok(p);
  assert.equal(paymentLabel(p.payments[1], "ru"), "Проезд");
  assert.equal(paymentLabel(p.payments[1], "en"), "Travel");
  assert.equal(deductionLabel(p.deductions[1], "ru"), "Национальное страхование");
  assert.equal(paymentLabel({ ...p.payments[0], kind: "other", description: "תוספת מיוחדת" }, "en"), "תוספת מיוחדת");
  assert.deepEqual(yearToDateFromPayslip(p), { months: 3, taxable: 47100, taxPaid: 3000 });
  assert.equal(yearToDateFromPayslip({ ...p, tax: { ...p.tax, monthsInCalculation: 12 } }), null);
});

test("fund rates come from the payslip's own amounts and bases, for the salary calculator", () => {
  const { payslip: p } = parsePayslipItems(page());
  assert.ok(p);
  assert.deepEqual(fundRatesFromPayslip(p), {
    pensionEmployee: 0.0615, // 800 / 13,000
    pensionEmployer: 0.065, // 845 / 13,000
    severance: 0.06, // 780 / 13,000
    studyFundEmployee: 0.025, // 250 / 10,000
    studyFundEmployer: 0.075, // 750 / 10,000
  });
  const noBase = fundRatesFromPayslip({ ...p, deposits: { ...p.deposits, pensionBase: null, studyFundBase: 0 } });
  assert.deepEqual(Object.values(noBase), [null, null, null, null, null]);
});

test("savings add up your deductions and the employer's deposits over the payslips", () => {
  const { payslip: p } = parsePayslipItems(page());
  assert.ok(p);
  const one = savingsFromPayslips([p]);
  assert.deepEqual(
    [one.pensionEmployee, one.pensionEmployer, one.severance, one.studyFundEmployee, one.studyFundEmployer],
    [800, 845, 780, 250, 750],
  );
  assert.equal(one.total, 3425);
  const two = savingsFromPayslips([p, p]);
  assert.equal(two.months, 2);
  assert.equal(two.total, 6850);
  assert.equal(savingsFromPayslips([]).total, 0);
});

test("vacation check: pay matches days taken, carry jumps and odd accruals are flagged", () => {
  const { payslip: p } = parsePayslipItems(page());
  assert.ok(p);
  const month = (id: string, leave: [number, number, number | null, number], pay: { qty: number; rate: number } | null, base = 12000) => ({
    ...p,
    id,
    year: 2026,
    month: Number(id.slice(5)),
    job: { ...p.job, daysExpected: 20 },
    leave: [{ label: "x", kind: "vacation" as const, previous: leave[0], added: leave[1], used: leave[2], balance: leave[3] }],
    payments: [
      { description: "שכר יסוד", kind: "base_salary" as const, quantity: null, rate: null, taxableValue: null, amount: base, benefit: false },
      ...(pay ? [{ description: "חופשה", kind: "vacation" as const, quantity: pay.qty, rate: pay.rate, taxableValue: null, amount: pay.qty * pay.rate, benefit: false }] : []),
    ],
  });
  const list = [
    month("2026-01", [5, 1, null, 6], null),
    month("2026-02", [6, 1, 2, 5], { qty: 2, rate: 600 }, 10800), // 10,800 + 2 x 600 = 12,000 = 600 x 20
    month("2026-03", [5, -0.5, null, 4.5], null), // a negative accrual
    month("2026-04", [6, 1, null, 7], null), // starts 1.5 above the 4.5 left
    month("2026-05", [7, 1, 1, 7], { qty: 2, rate: 600 }, 10800), // paid 2, took 1
  ];
  const r = checkVacation(list);
  const kinds = (id: string) => r.rows.find((x) => x.id === id)!.flags.map((f) => f.kind);
  assert.deepEqual(kinds("2026-01"), []);
  assert.deepEqual(kinds("2026-02"), []);
  assert.deepEqual(kinds("2026-03"), ["accrual"]);
  assert.deepEqual(kinds("2026-04"), ["carry"]);
  assert.deepEqual(kinds("2026-05"), ["paid_days"]);
  assert.equal(r.jumpTotal, 1.5);
  assert.equal(r.usedTotal, 3);
  assert.equal(r.flagged, 3);
  assert.equal(checkVacation(list, 2).rows.length, 2);
  assert.deepEqual(checkVacation(list, 2).rows[0].flags.map((f) => f.kind), ["carry"]);
});
