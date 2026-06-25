import { computePace } from "../src/utils/pace";
import type { Transaction } from "../src/types";
import type { ConfiguredCharge } from "../src/utils/fixedCharges";

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

const opts = {
  cycleDay,
  includeFixed: false as const,
  today,
  configuredCharges,
  statementSpendOverride: 8939.48,
  statementVariableOverride: 8939.48,
};

const pace = computePace(paceHistory, opts);
const mayRow = pace?.recentCycles.find((c) => c.cycleStart.startsWith("2026-05"));
const aprilRow = pace?.recentCycles.find((c) => c.cycleStart.startsWith("2026-04"));

console.log("usual at day:", pace?.historicalAvgAtDay);
console.log("May at day:", mayRow?.totalAtDay);
console.log("April at day:", aprilRow?.totalAtDay);

const mayExtras = 600;
const aprilExtras = 600;
const mayVisa = 487 * 15;
const aprilVisa = 400 * 15;

if (!mayRow || !aprilRow) {
  console.error("FAIL: missing cycle rows");
  process.exit(1);
}

if (Math.abs(mayRow.totalAtDay - (mayVisa + mayExtras)) > 1) {
  console.error("FAIL: May should use 600 extras, not 1050", mayRow.totalAtDay);
  process.exit(1);
}

if (Math.abs(aprilRow.totalAtDay - (aprilVisa + aprilExtras)) > 1) {
  console.error("FAIL: April should use 600 extras", aprilRow.totalAtDay);
  process.exit(1);
}

if (Math.abs((pace?.historicalAvgAtDay ?? 0) - (mayRow.totalAtDay + aprilRow.totalAtDay) / 2) > 1) {
  console.error("FAIL: usual avg mismatch");
  process.exit(1);
}

console.log("OK");
