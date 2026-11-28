import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeSpendingPeriod } from "../../core/spending/spendingPeriod.js";
import type { Transaction } from "../../core/types.js";

function tx(date: string, amount: number): Transaction {
  return { date, merchant_en: "Shop", amount, charge_amount: amount, category_en: "Groceries" } as unknown as Transaction;
}

const REF = new Date(2026, 10, 28); // 28 Nov 2026, cycle day 10 → the open cycle began on 10 Nov

test("year to date starts at the first cycle of the year, not at 1 January", () => {
  const a = analyzeSpendingPeriod([tx("2026-01-05", 100), tx("2026-01-10", 200), tx("2026-11-12", 50)], "ytd", REF, 10);
  assert.equal(a.current.start, "2026-01-10");
  assert.equal(a.currentTotal, 250); // 5 Jan belongs to the December cycle and stays out
  assert.equal(a.cycleTotals.length, 2);
  assert.equal(a.cyclesWithData, 2);
});

test("12 cycles are the open cycle and the 11 before it", () => {
  const a = analyzeSpendingPeriod([tx("2025-11-20", 70), tx("2025-12-10", 30), tx("2026-11-20", 10)], "rolling12", REF, 10);
  assert.equal(a.current.start, "2025-12-10");
  assert.equal(a.currentTotal, 40);
  assert.equal(a.prior.start, "2024-12-10");
  assert.equal(a.prior.end, "2025-11-28");
  assert.equal(a.priorTotal, 70);
});

test("totals are grouped by billing cycle", () => {
  const a = analyzeSpendingPeriod([tx("2026-10-09", 10), tx("2026-10-10", 20), tx("2026-11-09", 30)], "ytd", REF, 10);
  assert.deepEqual(a.cycleTotals.map((c) => [c.key, c.total]), [["2026-09-10", 10], ["2026-10-10", 50]]);
});
