/** Salary calculator: hand-worked cases from the public tax rules (no real payslips in the repo). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAW_2026,
  LAW_2026_BEFORE_AMENDMENT,
  bracketTax,
  computeSalary,
  grossForNet,
} from "../../core/salary/salaryCalc.js";

const close = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("a steady ₪15,000 month, worked out by hand", () => {
  const r = computeSalary({ gross: 15000 });
  // Brackets: 10% of 7,010 + 14% of 3,050 + 20% of (15,000 − 10,060) = 701 + 427 + 988.
  // Credits: 2.25 points × 242 = 544.50, plus 35% of the ₪900 pension deposit capped at ₪679 = 237.65.
  close(r.incomeTax, 701 + 427 + 988 - 544.5 - 237.65);
  // 1.04% of 7,703 + 7% of the rest = 80.11 + 510.79; 3.23% of 7,703 + 5.17% of the rest = 248.81 + 377.25.
  assert.equal(r.nationalInsurance, 591);
  assert.equal(r.healthTax, 626);
  assert.equal(r.pension, 900);
  assert.equal(r.studyFund, 0);
  close(r.net, 15000 - 1333.85 - 591 - 626 - 900);
  assert.equal(r.marginalIncomeTaxRate, 0.2);
});

test("perks add to the tax base but not to the pay; pension can be on a lower salary; study fund comes after tax", () => {
  const r = computeSalary({ gross: 18000, benefits: 600, pensionBase: 12000, studyFundBase: 10000 });
  assert.equal(r.taxable, 18600);
  assert.equal(r.pension, 720);
  assert.equal(r.studyFund, 250);
  // Net is cash pay minus deductions: the 600 of perks is never paid out.
  close(r.net, 18000 - r.incomeTax - r.nationalInsurance - r.healthTax - 720 - 250);
  assert.deepEqual(r.employer, { pension: 780, severance: 720, studyFund: 750 });
});

test("a pension deposit below the cap earns a smaller credit", () => {
  const r = computeSalary({ gross: 15000, pensionBase: 5000 });
  // 6% of 5,000 = 300 → credit 35% × 300 = 105.
  close(r.creditsPerMonth, 544.5 + 105);
});

test("credits can't push the tax below zero, and National Insurance still applies", () => {
  const r = computeSalary({ gross: 4000 });
  assert.equal(r.incomeTax, 0);
  assert.equal(r.nationalInsurance, 42); // 1.04% of 4,000
  assert.equal(r.healthTax, 129); // 3.23% of 4,000
});

test("above ₪60,130 a month the top rate is 47% plus the 3% surtax", () => {
  const r = computeSalary({ gross: 70000 });
  const expected = 701 + 427 + 1788 + 1891 + 7556.5 + 6316.8 + 9870 * 0.5 - 544.5 - 237.65;
  close(r.incomeTax, expected);
  assert.equal(r.marginalIncomeTaxRate, 0.5);
});

test("twelve identical months in the cumulative method equal one steady month", () => {
  const steady = computeSalary({ gross: 21000, benefits: 500 });
  for (const months of [1, 5, 11]) {
    const ytd = { months, taxable: months * 21500, taxPaid: months * steady.incomeTax };
    close(computeSalary({ gross: 21000, benefits: 500, yearToDate: ytd }).incomeTax, steady.incomeTax, 0.02);
  }
});

test("a big month is smoothed over the year: less tax than a one-month calculator says", () => {
  const steady = computeSalary({ gross: 16000 });
  // Four months of ₪16,000, then ₪30,000 in the fifth.
  const ytd = { months: 4, taxable: 64000, taxPaid: 4 * steady.incomeTax };
  const fifth = computeSalary({ gross: 30000, yearToDate: ytd });
  const alone = computeSalary({ gross: 30000 });
  assert.ok(fifth.incomeTax < alone.incomeTax - 100, `${fifth.incomeTax} vs ${alone.incomeTax}`);
  // …and over the five months the same tax is due as if the five months were taxed together.
  const together = bracketTax(94000, 5, LAW_2026) - 5 * fifth.creditsPerMonth;
  close(4 * steady.incomeTax + fifth.incomeTax, together, 0.02);
});

test("the March 2026 amendment: the same months cost less tax under the wider brackets, refunded in the first payslip that has them", () => {
  const before = computeSalary({ gross: 17500 }, LAW_2026_BEFORE_AMENDMENT);
  const after = computeSalary({ gross: 17500 }, LAW_2026);
  assert.ok(after.incomeTax < before.incomeTax);
  // Three months already withheld under the old brackets; the fourth month recalculates all four.
  const ytd = { months: 3, taxable: 52500, taxPaid: 3 * before.incomeTax };
  const fourth = computeSalary({ gross: 17500, yearToDate: ytd }, LAW_2026);
  close(3 * before.incomeTax + fourth.incomeTax, 4 * after.incomeTax, 0.02);
  assert.ok(fourth.incomeTax < after.incomeTax);
});

test("net → gross is the inverse (within the rounding steps), and net never falls when gross rises", () => {
  const inputs = { benefits: 600, pensionBase: 13000, studyFundBase: 12000 };
  for (const gross of [9000, 15000, 18108, 26000, 40000]) {
    const net = computeSalary({ ...inputs, gross }).net;
    const back = grossForNet(net, inputs);
    // National Insurance and health tax are rounded to whole shekels, so net moves in small steps
    // and a gross within ~₪3 leaves the same net.
    assert.ok(back != null && Math.abs(back - gross) < 3, `${gross} → ${net} → ${back}`);
  }
  let prev = -Infinity;
  for (let g = 3000; g <= 60000; g += 250) {
    const net = computeSalary({ ...inputs, gross: g }).net;
    assert.ok(net >= prev - 1, `net fell at ${g}`);
    prev = net;
  }
  assert.equal(grossForNet(0, inputs), null);
});
