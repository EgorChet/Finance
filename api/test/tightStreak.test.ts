/** Inside a tight cycle, the last full days under the daily amount are worth saying out loud. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tightStreak } from "../../core/spending/tightCycle.js";

// Cumulative everyday spend per day: 400, 500, 300, then 120, 90, 150.
const byDay = [400, 900, 1200, 1320, 1410, 1560];

test("counts the last days under the limit and how many more close the gap", () => {
  const s = tightStreak(byDay, 6, 200, 330, 1200);
  assert.ok(s);
  assert.equal(s.days, 3);
  assert.equal(s.avgPerDay, 120);
  // Each such day saves 330 − 120 = 210 vs a normal day → 1200 / 210 → 6 days.
  assert.equal(s.daysToClose, 6);
});

test("nothing to say when yesterday was over the limit", () => {
  assert.equal(tightStreak([100, 500], 2, 200, 330, 900), null);
});

test("only full days count (the sync day itself is left out by the caller)", () => {
  const s = tightStreak(byDay, 5, 200, 330, 1200);
  assert.equal(s?.days, 2);
});
