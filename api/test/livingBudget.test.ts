/**
 * Several extras ("top-ups") in one month: the month's extra is their sum, the old one-per-month
 * format keeps working, and saving the full list (PUT /living-budget) round-trips every entry.
 * Run: npm test (in api/).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Local file storage in a throwaway folder — never touches real data.
process.env.STORAGE = "local";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "finance-test-"));

const core = await import("../../core/household/livingBudget.js");
const api = await import("../src/services/livingBudget.js");

const segments = [{ amount: 20700, from_month: "2026-01", through_month: "2035-12" }];
const november = [
  { month: "2026-11", extra: 486.43, note: "Остаток октября" },
  { month: "2026-11", extra: 188, note: "Прочее" },
  { month: "2026-11", extra: 300, note: "Парковка (компенсация)" },
];

test("several extras in one month add up", () => {
  assert.equal(core.monthTopupExtraForMonth("2026-11", november), 974.43);
  assert.equal(core.livingBudgetForMonth("2026-11", segments, november), 21674.43);
  assert.equal(core.monthTopupExtraForMonth("2026-10", november), 0);
  assert.deepEqual(
    core.monthTopupsForMonth("2026-11", november).map((t) => t.note),
    ["Остаток октября", "Прочее", "Парковка (компенсация)"],
  );
});

test("old format: one extra per month still works", () => {
  const old = [
    { month: "2026-10", extra: 4400, note: "800 Salary extra + 700 (dollars) + 1200 savings + 1700papa" },
    { month: "2026-11", extra: 974.43 },
  ];
  assert.equal(core.validateLivingBudgetMonthTopups(old, segments), null);
  assert.equal(core.livingBudgetForMonth("2026-10", segments, old), 25100);
  assert.equal(core.livingBudgetForMonth("2026-11", segments, old), 21674.43);
});

test("validation accepts several extras per month, still rejects bad ones", () => {
  assert.equal(core.validateLivingBudgetMonthTopups(november, segments), null);
  assert.equal(api.validateLivingBudget(segments, november), null);
  assert.match(String(api.validateLivingBudget(segments, [{ month: "2026-11", extra: 0 }])), /positive/);
  assert.match(String(api.validateLivingBudget(segments, [{ month: "2025-06", extra: 100 }])), /No base budget/);
});

test("saving the full list keeps every extra, in order (PUT /living-budget)", async () => {
  const saved = await api.saveLivingBudget(segments, [{ month: "2026-12", extra: 50, note: "Gift" }, ...november]);
  const nov = (saved.month_topups ?? []).filter((t) => t.month === "2026-11");
  assert.equal(nov.length, 3);
  assert.deepEqual(nov.map((t) => t.extra), [486.43, 188, 300]);
  assert.equal(api.loadLivingBudgetData().month_topups?.length, 4);
  // The API's own budget for the month uses what was just saved.
  assert.equal(api.livingBudgetForMonth("2026-11"), 21674.43);
});
