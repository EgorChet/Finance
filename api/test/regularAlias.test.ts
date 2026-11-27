import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRegularAliases, normalizeRegularChargeOverrides } from "../src/services/regularCharges.js";
import type { SpendingReport, Transaction } from "../src/types.js";

const tx = (merchant_he: string, amount: number): Transaction => ({
  date: "2026-11-10",
  merchant_he,
  amount,
  charge_amount: amount,
  transaction_type_he: "",
  category_he: null,
  notes: null,
  merchant_en: merchant_he,
  category_en: "BIT",
  merchant_known: true,
});
const report = (transactions: Transaction[]) => ({ transactions }) as unknown as SpendingReport;

test("a name given to a bill lands only on the charges that match it", () => {
  const overrides = normalizeRegularChargeOverrides({ hairdresser: { alias: "  Test Barber  " } });
  assert.equal(overrides.hairdresser?.alias, "Test Barber");
  const out = applyRegularAliases(report([tx('העברה ב BIT בנה"פ', 120), tx('העברה ב BIT בנה"פ', 95), tx("BIT", 120), tx("שופרסל", 120)]), overrides);
  assert.deepEqual(out.transactions.map((t) => t.display_name), ["Test Barber", undefined, "Test Barber", undefined]);
});

test("without a name nothing changes, and a blank or unknown entry is dropped", () => {
  const r = report([tx("BIT", 120)]);
  assert.equal(applyRegularAliases(r, {}), r);
  assert.deepEqual(normalizeRegularChargeOverrides({ hairdresser: { alias: "   " }, nonsense: { alias: "x" } }), {});
});

test("a change of name changes the signature that forces stored reports to be rebuilt", async () => {
  const { regularAliasSignature } = await import("../src/services/regularCharges.js");
  const a = regularAliasSignature({ hairdresser: { alias: "A" } });
  const b = regularAliasSignature({ hairdresser: { alias: "B" } });
  assert.notDeepEqual(a, b);
  assert.deepEqual(regularAliasSignature({}), []);
});
