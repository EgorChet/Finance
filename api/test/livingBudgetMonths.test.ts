/** Month-by-month salary: an expected amount first, the payslip's net once it is uploaded. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyMonthBases, resolveMonthBases, type LivingBudgetSegment } from "../../core/household/livingBudget.js";

process.env.STORAGE = "local";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "budget-months-"));

const seg = (amount: number, from: string, through: string): LivingBudgetSegment => ({ amount, from_month: from, through_month: through });

test("a payslip counts from the open cycle's month on; for a past month only when you gave it an estimate", () => {
  const nets = { "2026-09": 12000, "2026-10": 13988, "2026-11": 14100 };
  const none = resolveMonthBases({ estimates: [], payslipNets: nets, currentMonth: "2026-11" });
  const real = none.filter((b) => b.source !== "latest");
  assert.deepEqual(real.map((b) => [b.month, b.amount, b.source]), [["2026-11", 14100, "payslip"]]);
  // months from the open cycle on with nothing of their own follow the latest payslip (a year ahead)
  const latest = none.filter((b) => b.source === "latest");
  assert.equal(latest.length, 11);
  assert.deepEqual([latest[0].month, latest[0].amount, latest[10].month], ["2026-12", 14100, "2027-10"]);

  const withEstimates = resolveMonthBases({
    estimates: [{ month: "2026-10", amount: 13500 }, { month: "2026-12", amount: 13000 }],
    payslipNets: nets,
    currentMonth: "2026-11",
  });
  assert.deepEqual(withEstimates.filter((b) => b.source !== "latest").map((b) => [b.month, b.amount, b.source, b.estimate ?? null]), [
    ["2026-10", 13988, "payslip", 13500], // a past month you confirmed: the real net replaces the estimate
    ["2026-11", 14100, "payslip", null],
    ["2026-12", 13000, "estimate", null], // not paid yet: still the estimate
  ]);
});

test("months are cut out of a period and given their own amount; everything else is left alone", () => {
  const periods = [seg(12000, "2026-01", "2026-06"), seg(13200, "2026-09", "2035-12")];
  const out = applyMonthBases(periods, [
    { month: "2026-11", amount: 14000, source: "estimate" },
    { month: "2026-09", amount: 13262, source: "payslip" },
    { month: "2026-07", amount: 12721, source: "payslip" }, // no period covers July: it gets its own
  ]);
  assert.deepEqual(out.map((s) => [s.amount, s.from_month, s.through_month]), [
    [12000, "2026-01", "2026-06"],
    [12721, "2026-07", "2026-07"],
    [13262, "2026-09", "2026-09"],
    [13200, "2026-10", "2026-10"],
    [14000, "2026-11", "2026-11"],
    [13200, "2026-12", "2035-12"],
  ]);
  // Every month resolves to exactly one amount.
  for (const ym of ["2026-03", "2026-07", "2026-09", "2026-10", "2026-11", "2026-12", "2030-05"]) {
    assert.equal(out.filter((s) => s.from_month <= ym && ym <= s.through_month).length, ym === "2026-08" ? 0 : 1, ym);
  }
  assert.equal(applyMonthBases(periods, []), periods);
});

test("stored budget: an estimate is kept when the periods are saved, the payslip takes over and the suggestion is the latest net", async () => {
  const { saveLivingBudget, setMonthEstimate, effectiveLivingBudget, loadLivingBudgetData } = await import("../src/services/livingBudget.js");
  const { importPayslipPages } = await import("../src/services/payslips/payslipService.js");
  const now = new Date(2026, 10, 21); // 21 Nov: the cycle that began on the 10th belongs to November

  await saveLivingBudget([seg(13200, "2026-01", "2027-12")], [], []);
  let eff = await effectiveLivingBudget(now, 10);
  assert.deepEqual(eff.month_bases, []);
  assert.equal(eff.estimate_suggestion, null);

  await setMonthEstimate("2026-11", 14000);
  // Saving the periods again (the Budget page does not send estimates) must not drop it.
  await saveLivingBudget([seg(13200, "2026-01", "2027-12")], [], []);
  assert.deepEqual(loadLivingBudgetData().month_estimates, [{ month: "2026-11", amount: 14000 }]);
  eff = await effectiveLivingBudget(now, 10);
  assert.deepEqual(eff.month_bases.map((b) => [b.month, b.amount, b.source]), [["2026-11", 14000, "estimate"]]);
  assert.deepEqual(eff.segments.map((s) => [s.amount, s.from_month, s.through_month]), [
    [13200, "2026-01", "2026-10"], [14000, "2026-11", "2026-11"], [13200, "2026-12", "2027-12"],
  ]);

  // The payslip for November arrives (invented page, same layout as the real template).
  const it = (x1: number, y: number, str: string) => ({ str, x0: x1 - str.length * 5, x1, y });
  const page = [
    it(316, 16, "תלוש משכורת"), it(226, 16, "11/26"), it(565, 20, "חברת דוגמה"),
    it(539, 156, "תיאור תשלום"), it(563, 168, "שכר יסוד"), it(415, 168, "15,000.00"), it(246, 168, "15,000.00"),
    it(165, 172, "מס הכנסה שולי%"), it(72, 172, "1,000.00"), it(165, 220, "מגדל פנסיה"), it(71, 220, "500.00"),
    it(520, 424, "הפקדות מעסיק לקופות גמל"), it(162, 432, 'סה"כ תשלומים'), it(72, 432, "15,000.00"),
    it(156, 444, "יכויי חובה וגמל"), it(70, 444, "1,500.00"),
    it(161, 456, "שכר"), it(140, 456, "נ"), it(135, 456, "טו"), it(72, 456, "13,500.00"),
    it(160, 480, "נ"), it(156, 480, "טו לתשלום"), it(72, 480, "13,500.00"),
  ];
  await importPayslipPages([page], Buffer.from("%PDF-1.4 fake"));
  eff = await effectiveLivingBudget(now, 10);
  assert.deepEqual(eff.month_bases.filter((b) => b.source !== "latest").map((b) => [b.month, b.amount, b.source, b.estimate ?? null]), [["2026-11", 13500, "payslip", 14000]]);
  assert.equal(eff.estimate_suggestion, 13500);

  // Clearing the estimate is allowed; nonsense is refused.
  await setMonthEstimate("2026-11", null);
  assert.deepEqual(loadLivingBudgetData().month_estimates, []);
  await assert.rejects(() => setMonthEstimate("2026-11", -5));
  await assert.rejects(() => setMonthEstimate("November", 100));
});
