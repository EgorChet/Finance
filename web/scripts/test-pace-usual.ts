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

// Pace history: past cycles visa-only (no fixed_charge rows)
const paceHistory: Transaction[] = [];
for (let d = 11; d <= 25; d++) paceHistory.push(tx(`2026-05-${String(d).padStart(2, "0")}`, 487));
for (let d = 11; d <= 30; d++) paceHistory.push(tx(`2026-04-${d}`, 400));
for (let d = 1; d <= 9; d++) paceHistory.push(tx(`2026-05-0${d}`, 400));

// Current cycle report only: has configured extras merged client-side
const cycleTxs: Transaction[] = [
  tx("2026-06-10", 600, "fixed_charge:cibus-card"),
  tx("2026-06-10", 450, "fixed_charge:flexi"),
];
for (let d = 11; d <= 25; d++) {
  cycleTxs.push(tx(`2026-06-${String(d).padStart(2, "0")}`, 520));
}

const pace = computePace(paceHistory, {
  cycleDay,
  includeFixed: false,
  today,
  configuredCharges: [],
  cycleTransactions: cycleTxs,
  statementSpendOverride: 8939.48,
  statementVariableOverride: 8939.48,
});

const paceVisaOnly = computePace(paceHistory, {
  cycleDay,
  includeFixed: false,
  today,
  configuredCharges: [],
  cycleTransactions: [],
  statementSpendOverride: 8939.48,
  statementVariableOverride: 8939.48,
});

const usual = pace?.historicalAvgAtDay ?? 0;
const visaOnlyUsual = paceVisaOnly?.historicalAvgAtDay ?? 0;
const delta = usual - visaOnlyUsual;
console.log("historicalAvgAtDay:", usual, "visa-only:", visaOnlyUsual, "delta:", delta);

if (delta < 1000) {
  console.error("FAIL: inferring from cycleTransactions should add ~1050 to historical usual");
  process.exit(1);
}
console.log("OK");
