/** A partial Cal export lists some purchases twice: "being received" and already charged. */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.STORAGE = "local";
const { dropPendingDuplicates } = await import("../src/services/reportService.js");

const tx = (merchant_he: string, date: string, amount: number, notes: string | null = null) => ({
  date,
  merchant_he,
  amount,
  charge_amount: amount,
  transaction_type_he: "רגילה",
  category_he: null,
  notes,
  merchant_en: "",
  category_en: "Groceries",
  merchant_known: false,
});

test("drops the 'being received' row when the same purchase is already charged", () => {
  const rows = [
    tx("טיב טעם רשתות נתניה", "2026-11-12", 83.88, "עסקה בקליטה"),
    tx("טיב טעם רשתות נתניה", "2026-11-12", 83.88),
    tx("אודים מרקט", "2026-11-12", 75, "עסקה בקליטה"),
    tx("אודים מרקט", "2026-11-12", 75),
    tx("רוזמרין", "2026-11-13", 74, "עסקה בקליטה"),
    tx("תל יצחק קפה", "2026-11-12", 22, "עסקה בקליטה"),
    tx("אי.וי. אדג' בע\"מ", "2026-11-10", 175),
    tx("אי.וי. אדג' בע\"מ", "2026-11-10", 175),
  ];
  const kept = dropPendingDuplicates(rows as never);
  assert.equal(kept.length, 6);
  const total = kept.reduce((s: number, t: { charge_amount: number }) => s + t.charge_amount, 0);
  assert.equal(Math.round(total * 100) / 100, 83.88 + 75 + 74 + 22 + 175 + 175);
  // Pending rows without a charged twin stay; both real EV Edge payments stay.
  assert.equal(kept.filter((t: { merchant_he: string }) => t.merchant_he.includes("אדג")).length, 2);
  assert.ok(kept.some((t: { merchant_he: string }) => t.merchant_he === "רוזמרין"));
});

test("a different amount or merchant is not a duplicate", () => {
  const rows = [
    tx("טיב טעם רשתות נתניה", "2026-11-12", 83.88, "עסקה בקליטה"),
    tx("טיב טעם רשתות נתניה", "2026-11-12", 90),
    tx("שופרסל דיל", "2026-11-12", 50, "עסקה בקליטה"),
    tx("רמי לוי", "2026-11-12", 50),
  ];
  assert.equal(dropPendingDuplicates(rows as never).length, 4);
});

test("one charged row absorbs only one pending row", () => {
  const rows = [
    tx("ארקפה פולג", "2026-11-12", 18, "עסקה בקליטה"),
    tx("ארקפה פולג", "2026-11-12", 18, "עסקה בקליטה"),
    tx("ארקפה פולג", "2026-11-12", 18),
  ];
  assert.equal(dropPendingDuplicates(rows as never).length, 2);
});
