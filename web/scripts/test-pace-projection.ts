import { computePace } from "../src/utils/pace";
import type { Transaction } from "../src/types";
import type { ConfiguredCharge } from "../src/utils/fixedCharges";

const cycleDay = 10;
const today = new Date(2026, 5, 25);

function tx(date: string, amount: number): Transaction {
  return {
    date,
    merchant_he: "S",
    merchant_en: "S",
    amount,
    charge_amount: amount,
    transaction_type_he: "",
    category_he: null,
    category_en: "Groceries",
    notes: null,
    merchant_known: true,
    billing_month: "",
  };
}

const configuredCharges: ConfiguredCharge[] = [
  {
    id: "cibus",
    name_en: "Cibus",
    name_he: "Cibus",
    amount: 600,
    category_en: "Groceries",
    from_month: "2020-01",
    through_month: "2099-12",
  },
  {
    id: "new-extra",
    name_en: "New extra",
    name_he: "New extra",
    amount: 450,
    category_en: "Groceries",
    from_month: "2026-06",
    through_month: "2099-12",
  },
];

const paceHistory: Transaction[] = [];
for (let d = 11; d <= 25; d++) {
  paceHistory.push(tx(`2026-05-${String(d).padStart(2, "0")}`, 467));
  paceHistory.push(tx(`2026-04-${String(d).padStart(2, "0")}`, 467));
}
for (let d = 26; d <= 30; d++) paceHistory.push(tx(`2026-04-${d}`, 467));
for (let d = 26; d <= 30; d++) paceHistory.push(tx(`2026-05-${d}`, 467));

const visaAtDay = 467 * 15;
const usualAtDay = visaAtDay + 600;
const currentSpend = visaAtDay + 1050;

const pace = computePace(paceHistory, {
  cycleDay,
  includeFixed: false,
  today,
  configuredCharges,
  avgCycles: 2,
  statementSpendOverride: currentSpend,
  statementVariableOverride: currentSpend,
});

if (!pace) {
  console.error("FAIL: no pace result");
  process.exit(1);
}

const oldStyleProjection = round(
  pace.historicalFullCycleEverydayAvg * (currentSpend / pace.historicalAvgAtDay),
);
const delta = pace.projectedVsUsualDelta;

console.log("usual at day:", pace.historicalAvgAtDay);
console.log("current spend:", currentSpend);
console.log("old-style projection delta:", round(oldStyleProjection - pace.historicalFullCycleEverydayAvg));
console.log("new projection:", pace.projectedTotal);
console.log("adjusted usual month:", pace.projectedAtUsualPaceForecast);
console.log("new delta:", delta);

if (Math.abs(pace.historicalAvgAtDay - usualAtDay) > 1) {
  console.error("FAIL: unexpected usual at day", pace.historicalAvgAtDay);
  process.exit(1);
}

if (pace.projectedTotal >= oldStyleProjection - 1) {
  console.error("FAIL: new projection should be lower than flat-ratio projection");
  process.exit(1);
}

if (Math.abs(delta) > 250) {
  console.error("FAIL: month-end delta should be small when only Visa matches usual pace", delta);
  process.exit(1);
}

console.log("OK");

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
