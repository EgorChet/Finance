import { computePace } from "../src/utils/pace";
import type { Transaction } from "../src/types";

const cycleDay = 10;
const today = new Date(2026, 5, 25);

function tx(date: string, amount: number, notes: string | null = null): Transaction {
  return {
    date,
    merchant_he: "S",
    merchant_en: "S",
    amount,
    charge_amount: amount,
    transaction_type_he: "",
    category_he: null,
    category_en: "Groceries",
    notes,
    merchant_known: true,
    billing_month: "",
  };
}

const paceHistory: Transaction[] = [];
for (let d = 11; d <= 25; d++) paceHistory.push(tx(`2026-05-${String(d).padStart(2, "0")}`, 487));
for (let d = 11; d <= 30; d++) paceHistory.push(tx(`2026-04-${d}`, 400));
for (let d = 1; d <= 9; d++) paceHistory.push(tx(`2026-05-0${d}`, 400));

const opts = {
  cycleDay,
  includeFixed: false as const,
  today,
  configuredCharges: [] as const,
  statementSpendOverride: 8939.48,
  statementVariableOverride: 8939.48,
};

const withCompare = computePace(paceHistory, {
  ...opts,
  configuredEverydayCompare: 1050,
});
const without = computePace(paceHistory, { ...opts, configuredEverydayCompare: 0 });

const delta = (withCompare?.historicalAvgAtDay ?? 0) - (without?.historicalAvgAtDay ?? 0);
console.log("with compare 1050:", withCompare?.historicalAvgAtDay);
console.log("without:", without?.historicalAvgAtDay);
console.log("delta:", delta);

if (Math.abs(delta - 1050) > 1) {
  console.error("FAIL");
  process.exit(1);
}
console.log("OK");
