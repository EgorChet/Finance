/** New regular bills are offered only when a charge really behaves like a bill — never a café. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestRegularCharges } from "../../core/spending/regularSuggestions.js";
import { regularChargesForCycle, resolveRegularCharges } from "../../core/spending/regularCharges.js";
import { committedKind } from "../../core/spending/budgetPlan.js";
import { normalizeRegularChargeOverrides } from "../src/services/regularCharges.js";
import type { Transaction } from "../../core/types.js";

function tx(date: string, merchant: string, amount: number, type = "רגילה"): Transaction {
  return {
    date,
    merchant_he: merchant,
    merchant_en: merchant,
    amount,
    charge_amount: amount,
    transaction_type_he: type,
    category_he: null,
    category_en: "Other",
    notes: null,
    merchant_known: true,
  };
}
const STANDING = "הוראת קבע";
const opts = { cycleStart: "2026-11-10", cycleDay: 10 };

test("a standing order two cycles in a row, same amount and day, is offered", () => {
  const s = suggestRegularCharges(
    [tx("2026-09-25", "Insurance", 1353.4, STANDING), tx("2026-10-25", "Insurance", 1353.4, STANDING)],
    opts,
  );
  assert.equal(s.length, 1);
  assert.equal(s[0].key, "custom:Insurance");
  assert.equal(s[0].amount, 1353);
  assert.equal(s[0].day, 25);
});

test("coffee is never offered: several visits a cycle, or once a month at changing prices and days", () => {
  const cafe = [
    tx("2026-09-12", "Cafe", 22), tx("2026-09-20", "Cafe", 24),
    tx("2026-10-11", "Cafe", 22), tx("2026-10-19", "Cafe", 22),
    tx("2026-11-12", "Cafe", 22),
  ];
  assert.deepEqual(suggestRegularCharges(cafe, opts), []);
  const onceAMonth = [tx("2026-08-14", "Bistro", 180), tx("2026-09-27", "Bistro", 240), tx("2026-10-15", "Bistro", 95)];
  assert.deepEqual(suggestRegularCharges(onceAMonth, opts), []);
  // Even identical and on the same day: an ordinary card charge needs three cycles, not two.
  assert.deepEqual(suggestRegularCharges([tx("2026-09-15", "Bistro", 100), tx("2026-10-15", "Bistro", 100)], opts), []);
});

test("an ordinary card subscription is offered after three cycles", () => {
  const sub = [tx("2026-08-16", "Streaming", 49.9), tx("2026-09-16", "Streaming", 49.9), tx("2026-10-17", "Streaming", 51)];
  assert.equal(suggestRegularCharges(sub, opts).length, 1);
});

test("not offered: stopped coming, already a bill, declined, or one you said isn't regular", () => {
  const old = [tx("2026-06-25", "Insurance", 1353.4, STANDING), tx("2026-07-25", "Insurance", 1353.4, STANDING)];
  assert.deepEqual(suggestRegularCharges(old, opts), []);
  const ins = [tx("2026-09-25", "Insurance", 1353.4, STANDING), tx("2026-10-25", "Insurance", 1353.4, STANDING)];
  assert.deepEqual(suggestRegularCharges(ins, { ...opts, overrides: { "custom:Insurance": { dismissed: true } } }), []);
  assert.deepEqual(
    suggestRegularCharges(ins, { ...opts, overrides: { "custom:Insurance": { custom: { name: "Insurance", merchant: "Insurance" } } } }),
    [],
  );
  const wash = [tx("2026-09-18", "City Wash Express", 99, STANDING), tx("2026-10-18", "City Wash Express", 99, STANDING)];
  assert.deepEqual(suggestRegularCharges(wash, opts), []);
  const bezeq = [tx("2026-09-20", "בזק", 160, STANDING), tx("2026-10-20", "בזק", 160, STANDING)];
  assert.deepEqual(suggestRegularCharges(bezeq, opts), []);
});

test("saying yes makes it a bill: set aside when due, and its charges stop counting as everyday", () => {
  const overrides = normalizeRegularChargeOverrides({
    "custom:Insurance": { custom: { name: "Insurance" } },
    "custom:Gym": { dismissed: true },
    "custom:": { custom: { name: "x" } },
  });
  assert.deepEqual(Object.keys(overrides).sort(), ["custom:Gym", "custom:Insurance"]);
  const rules = resolveRegularCharges(overrides);
  const history = [tx("2026-09-25", "Insurance", 1353.4, STANDING), tx("2026-10-25", "Insurance", 1353.4, STANDING)];
  const status = regularChargesForCycle(rules, [], history, "2026-11-10", "2026-12-09", "2026-11-16").find((r) => r.id === "custom:Insurance");
  assert.equal(status?.state, "due");
  assert.equal(status?.amount, 1353);
  assert.equal(status?.date, "2026-11-25");
  assert.equal(committedKind(tx("2026-11-25", "Insurance", 1353.4), "2026-11-10", rules), "regular");
  // Another shop whose name merely contains the word isn't swept in.
  assert.equal(committedKind(tx("2026-11-25", "Insurance Cafe", 30), "2026-11-10", rules), null);
});
