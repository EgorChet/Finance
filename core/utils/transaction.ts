/** Leumi refund / credit transaction types (column 4 in Visa export). */
const REFUND_TYPE_MARKERS = ["זיכוי", "השבת מכירה"] as const;

export function isRefundTypeHe(transactionTypeHe: string | null | undefined): boolean {
  if (!transactionTypeHe) return false;
  return REFUND_TYPE_MARKERS.some((m) => transactionTypeHe.includes(m));
}

/** Net spend counted toward totals — after any user reimbursement. */
export function effectiveSpend(tx: {
  charge_amount: number;
  effective_amount?: number;
}): number {
  return tx.effective_amount ?? tx.charge_amount;
}

/** Bank credit / refund row. */
export function isRefundTransaction(tx: {
  charge_amount: number;
  amount?: number;
  transaction_type_he?: string;
}): boolean {
  if (isRefundTypeHe(tx.transaction_type_he)) return true;
  if (tx.charge_amount < 0) return true;
  if (tx.amount != null && tx.amount < 0) return true;
  return false;
}

/** Stable key for list rendering — includes type so charge/refund rows stay distinct. */
export function transactionRowKey(tx: {
  date: string;
  merchant_he: string;
  charge_amount: number;
  transaction_type_he?: string;
}): string {
  const type = tx.transaction_type_he?.trim() || "";
  return `${tx.date}|${tx.merchant_he}|${tx.charge_amount.toFixed(2)}|${type}`;
}

const INSTALLMENT = /תשלום\s+(\d+)\s+מתוך\s+(\d+)/;
const BILLING_ADJUSTMENT = "שינוי מועד חיוב";
const CARD_FEE_TYPE = "דמי חבר";

function isPendingCharge(
  chargeRaw: number | null | undefined,
  notes: string | null | undefined,
  transactionTypeHe?: string | null,
): boolean {
  if (notes?.includes("בקליטה")) return true;
  if (chargeRaw == null) return true;
  return chargeRaw <= 0;
}

export function parseInstallment(notes: string | null | undefined): [number, number] | null {
  if (!notes) return null;
  const match = INSTALLMENT.exec(notes);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

export function shouldSkipInstallmentRow(
  chargeRaw: number | null | undefined,
  notes: string | null | undefined,
  transactionTypeHe?: string | null,
): boolean {
  const installment = parseInstallment(notes);
  if (!installment) return false;
  if (installment[0] === 0) return true;
  return isPendingCharge(chargeRaw, notes, transactionTypeHe);
}

export function isBillingCycleAdjustment(merchant: string): boolean {
  return merchant.includes(BILLING_ADJUSTMENT);
}

export function isCardMembershipFee(merchant: string, transactionTypeHe?: string | null): boolean {
  if (transactionTypeHe === CARD_FEE_TYPE) return true;
  return merchant.includes("דמי כרטיס");
}

export function shouldSkipNonSpendRow(tx: {
  merchant_he: string;
  charge_amount: number;
  notes?: string | null;
  transaction_type_he?: string | null;
}): boolean {
  return shouldSkipNonSpendRowRaw(
    tx.charge_amount,
    tx.merchant_he,
    tx.notes ?? null,
    tx.transaction_type_he,
  );
}

export function shouldSkipNonSpendRowRaw(
  chargeRaw: number | null | undefined,
  merchant: string,
  notes: string | null,
  transactionTypeHe?: string | null,
): boolean {
  if (shouldSkipInstallmentRow(chargeRaw, notes, transactionTypeHe)) return true;
  if (isBillingCycleAdjustment(merchant)) return true;
  if (isCardMembershipFee(merchant, transactionTypeHe) && isPendingCharge(chargeRaw, notes, transactionTypeHe)) {
    return true;
  }
  return false;
}

export function filterSpendTransactions<
  T extends {
    merchant_he: string;
    charge_amount: number;
    notes?: string | null;
    transaction_type_he?: string | null;
  },
>(transactions: T[]): T[] {
  return transactions.filter((tx) => !shouldSkipNonSpendRow(tx));
}

export function transactionSnapshotKey(tx: {
  date: string;
  merchant_he: string;
  charge_amount: number;
  notes?: string | null;
}): string {
  const txDate = tx.date.slice(0, 10);
  const installment = parseInstallment(tx.notes);
  if (installment) {
    return `${txDate}|${tx.merchant_he}|inst|${installment[0]}|${installment[1]}`;
  }
  const charge = Math.round(tx.charge_amount * 100) / 100;
  return `${txDate}|${tx.merchant_he}|tx|${charge}|${tx.notes ?? ""}`;
}

export function pickBetterTransaction<
  T extends {
    date: string;
    merchant_he: string;
    charge_amount: number;
    charge_estimated?: boolean;
    notes?: string | null;
  },
>(a: T, b: T): T {
  const aEst = !!a.charge_estimated;
  const bEst = !!b.charge_estimated;
  if (aEst !== bEst) return aEst ? b : a;

  const aInst = parseInstallment(a.notes);
  const bInst = parseInstallment(b.notes);
  if (aInst && bInst && aInst[0] !== bInst[0]) {
    return aInst[0] > bInst[0] ? a : b;
  }

  if (a.charge_amount !== b.charge_amount) {
    return a.charge_amount < b.charge_amount ? a : b;
  }

  return b;
}

export function dedupeTransactionSnapshots<
  T extends {
    date: string;
    merchant_he: string;
    charge_amount: number;
    charge_estimated?: boolean;
    notes?: string | null;
  },
>(transactions: T[]): T[] {
  const best = new Map<string, T>();
  const order: string[] = [];
  for (const tx of transactions) {
    const key = transactionSnapshotKey(tx);
    if (!best.has(key)) {
      order.push(key);
      best.set(key, tx);
    } else {
      best.set(key, pickBetterTransaction(best.get(key)!, tx));
    }
  }
  return order.map((key) => best.get(key)!);
}
