/** The budget card's numbers, checked by hand on a small cycle — the figures plans are built on. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBudgetPlan } from "../../core/spending/budgetPlan.js";
import { regularChargesForCycle, resolveRegularCharges } from "../../core/spending/regularCharges.js";
import { dedupeAcrossSnapshots } from "../../core/utils/transaction.js";
import type { Transaction } from "../../core/types.js";

function tx(date: string, merchant: string, amount: number, extra: Partial<Transaction> = {}): Transaction {
  return {
    date,
    merchant_he: merchant,
    merchant_en: merchant,
    amount,
    charge_amount: amount,
    transaction_type_he: "רגילה",
    category_he: null,
    category_en: "Groceries",
    notes: null,
    merchant_known: true,
    ...extra,
  };
}

const cycle = [
  tx("2026-11-09", "Shop the day before", 500), // bought before the cycle → a bill, not everyday
  tx("2026-11-10", "Flat rent", 6900, { notes: "fixed_charge:flat-rent" }),
  tx("2026-11-10", "Supermarket", 300),
  tx("2026-11-12", "Cafe", 100),
  tx("2026-11-12", "Bezeq", 160),
];

test("everyday money = budget − bills; per day = what's left ÷ days left incl. today", () => {
  const plan = computeBudgetPlan(cycle, 10000, {
    cycleStart: "2026-11-10",
    cycleDay: 10,
    referenceDate: new Date(2026, 10, 16),
  });
  assert.ok(plan);
  assert.equal(plan.dayIndex, 7);
  assert.equal(plan.cycleLength, 30);
  assert.equal(plan.daysLeft, 24);
  // Bills: 500 (before the cycle) + 6900 rent + 160 Bezeq, plus hairdresser 120 and nails 220 set aside.
  assert.equal(plan.bills, 7900);
  assert.equal(plan.flexBudget, 2100);
  assert.equal(plan.flexSpent, 400);
  assert.equal(plan.flexLeft, 1700);
  assert.equal(plan.perDayLeft, 70.83);
  // No history → even split: through yesterday (day 6 of 30) the plan is 2100 × 6/30.
  assert.equal(plan.plannedSoFar, 420);
  assert.equal(plan.buffer, 20);
  assert.deepEqual(plan.actualByDay, [300, 300, 400, 400, 400, 400, 400]);
});

test("arnona is set aside only in the cycle it's expected in, not a cycle early", () => {
  const rules = resolveRegularCharges().filter((r) => r.id === "arnona");
  const history = [
    tx("2026-05-16", "ארנונה", 1527),
    tx("2026-07-13", "ארנונה", 1575),
    tx("2026-09-11", "ארנונה", 1546),
  ];
  // Expected ≈ 13 Nov: after the Oct 10 – Nov 9 cycle ends.
  const oct = regularChargesForCycle(rules, [], history, "2026-10-10", "2026-11-09", "2026-10-16");
  assert.equal(oct[0].state, "later");
  const nov = regularChargesForCycle(rules, [], history, "2026-11-10", "2026-12-09", "2026-11-10");
  assert.equal(nov[0].state, "due");
  assert.equal(nov[0].amount, 1546);
});

test("'by this day' counts this cycle like the past ones: purchases dated in the cycle only", () => {
  const history = [
    ...["2026-08", "2026-09", "2026-10"].flatMap((ym) => [tx(`${ym}-11`, "Supermarket", 350), tx(`${ym}-25`, "Supermarket", 900)]),
    ...cycle,
  ];
  const plan = computeBudgetPlan(cycle, 10000, {
    cycleStart: "2026-11-10",
    cycleDay: 10,
    referenceDate: new Date(2026, 10, 16),
    history,
  });
  assert.ok(plan?.byThisDay);
  // 300 + 100 — the ₪500 bought on the 9th is not part of "by day 7 of this cycle".
  assert.equal(plan.byThisDay.everyday, 400);
  assert.equal(plan.byThisDay.everydayRank, 1);
  assert.deepEqual(plan.byThisDay.past.map((p) => p.everyday), [350, 350, 350]);
});

test("history keeps two identical charges from one statement, drops copies from another", () => {
  const a = tx("2026-10-10", "EV EDGE", 175);
  const merged = dedupeAcrossSnapshots([
    [a, { ...a }, tx("2026-10-12", "Cafe", 20)],
    [{ ...a }, { ...a }],
  ]);
  assert.equal(merged.filter((t) => t.merchant_he === "EV EDGE").length, 2);
  assert.equal(merged.length, 3);
});
