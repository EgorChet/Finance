import { fetchPayslips } from "@/shared/api/client";
import { createCachedStore } from "@/shared/stores/createCachedStore";
import type { Payslip } from "@core/salary/payslip";

/** The owner's payslips, kept between visits so the Money tab opens with numbers already in. */
export const usePayslipsDataStore = createCachedStore<{ payslips: Payslip[] }>(
  "payslipsData",
  async (demo, token) => (demo ? { payslips: [] } : fetchPayslips(token)),
);
