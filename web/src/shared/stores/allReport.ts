import { fetchReport } from "@/shared/api/client";
import { createCachedStore } from "@/shared/stores/createCachedStore";

/**
 * Every charge from every statement (Transactions "All months" and All merchants).
 * Kept between screens and warmed in the background after the app opens, so those screens
 * show at once and refresh quietly.
 */
export const useAllReportStore = createCachedStore("allReport", (demo, token) => fetchReport(demo, null, token));
