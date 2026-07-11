import { reactive } from "vue";
import type { Transaction } from "@/shared/types";

export interface AdjustChargeOptions {
  transaction: Transaction;
  currentReimbursement?: number;
  note?: string;
}

export interface AdjustChargeResult {
  reimbursement: number;
  note?: string;
}

const state = reactive({
  open: false,
  transaction: null as Transaction | null,
  reimbursement: "",
  note: "",
  title: "Split charge",
});

let resolveFn: ((value: AdjustChargeResult | null) => void) | null = null;

export function adjustCharge(options: AdjustChargeOptions): Promise<AdjustChargeResult | null> {
  if (resolveFn) {
    resolveFn(null);
    resolveFn = null;
  }

  state.transaction = options.transaction;
  state.reimbursement = options.currentReimbursement != null
    ? String(options.currentReimbursement)
    : "";
  state.note = options.note ?? "";
  state.open = true;

  return new Promise((resolve) => {
    resolveFn = resolve;
  });
}

export function useAdjustChargeState() {
  function finish(result: AdjustChargeResult | null) {
    state.open = false;
    state.transaction = null;
    resolveFn?.(result);
    resolveFn = null;
  }

  return {
    state,
    accept: (reimbursement: number, note?: string) => finish({ reimbursement, note }),
    cancel: () => finish(null),
  };
}
