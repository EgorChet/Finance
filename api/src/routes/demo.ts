import { Router } from "express";
import {
  DEMO_AS_OF,
  demoExclusions,
  demoFixedCharges,
  demoLivingBudget,
  demoMonthCatalog,
  demoReviewQueue,
  demoRules,
  demoSummaryRows,
  getDemoReport,
} from "../data/demoData.js";
import { combineReports } from "../services/reportService.js";
import { getDemoFxcnQuote, getDemoKaspaQuote } from "../services/demoPortfolio.js";
import { getMarketSnapshot } from "../services/marketSnapshot.js";
import { defaultPaceSettings, withPaceSettings } from "../../../core/spending/paceSettings.js";
import { computeSpendingSummary } from "../../../core/summary.js";
import { parseReferenceDate } from "../../../core/utils/appDate.js";
import type { MonthItem as CoreMonthItem, SpendingReport as CoreSpendingReport } from "../../../core/types.js";

const router = Router();

function demoHomeBundle(paceMonths = 4) {
  const budget = demoLivingBudget();
  const catalog = demoMonthCatalog().sort((a, b) => b.key.localeCompare(a.key));
  const paceKeys = catalog.slice(0, paceMonths).map((m) => m.key);
  const scopedReports = Object.fromEntries(
    paceKeys.map((key) => [key, getDemoReport(key)]),
  );
  const ordered = [...paceKeys].sort();
  const reports = ordered.map((key) => scopedReports[key]!).filter(Boolean);
  const orderedLabels = ordered.map((key) => catalog.find((m) => m.key === key)?.label ?? key);
  const report =
    reports.length === 0
      ? null
      : reports.length === 1
        ? reports[0]
        : combineReports(
            reports,
            `${orderedLabels[0]} – ${orderedLabels[orderedLabels.length - 1]} (${ordered.length} months)`,
          );
  return {
    months: catalog,
    report,
    scoped_reports: scopedReports,
    pace_keys: paceKeys,
    fixed_charges: demoFixedCharges().charges,
    living_budget: { segments: budget.segments, month_topups: budget.month_topups || [] },
    demo_as_of: DEMO_AS_OF,
  };
}

router.get("/months", (_req, res) => {
  res.json({
    months: demoMonthCatalog().sort((a, b) => b.key.localeCompare(a.key)),
    summary: demoSummaryRows(),
    demo: true,
    demo_as_of: DEMO_AS_OF,
  });
});

router.get("/home-data", (req, res) => {
  const budget = demoLivingBudget();
  const paceMonths = Math.max(1, Number(req.query.pace_months ?? 4));
  const catalog = demoMonthCatalog().sort((a, b) => b.key.localeCompare(a.key));
  const paceKeys = catalog.slice(0, paceMonths).map((m) => m.key);
  const scopedReports = Object.fromEntries(
    paceKeys.map((key) => [key, getDemoReport(key)]),
  );
  const ordered = [...paceKeys].sort();
  const reports = ordered.map((key) => scopedReports[key]!).filter(Boolean);
  const orderedLabels = ordered.map((key) => catalog.find((m) => m.key === key)?.label ?? key);
  const report =
    reports.length === 0
      ? null
      : reports.length === 1
        ? reports[0]
        : combineReports(
            reports,
            `${orderedLabels[0]} – ${orderedLabels[orderedLabels.length - 1]} (${ordered.length} months)`,
          );
  res.json({
    months: catalog,
    summary: demoSummaryRows(),
    report,
    scoped_reports: scopedReports,
    pace_keys: paceKeys,
    pace_months: paceKeys.length,
    pace_months_requested: paceMonths,
    fixed_charges: demoFixedCharges().charges,
    living_budget: { segments: budget.segments, month_topups: budget.month_topups || [] },
    demo_as_of: DEMO_AS_OF,
  });
});

/** Same summary as /api/summary, on the demo household (its clock is frozen at DEMO_AS_OF). */
router.get("/summary", (req, res) => {
  const bundle = demoHomeBundle();
  const catalog = bundle.months as unknown as CoreMonthItem[];
  const reports: Record<string, CoreSpendingReport | undefined> = {};
  for (const m of catalog) reports[m.key] = getDemoReport(m.key) as unknown as CoreSpendingReport;
  const monthKey = typeof req.query.month === "string" && req.query.month ? req.query.month : null;
  const summary = withPaceSettings(defaultPaceSettings(), () =>
    computeSpendingSummary({
      months: catalog,
      paceReport: bundle.report as unknown as CoreSpendingReport | null,
      fixedCharges: bundle.fixed_charges as unknown as Parameters<typeof computeSpendingSummary>[0]["fixedCharges"],
      livingBudget: bundle.living_budget,
      referenceDate: parseReferenceDate(DEMO_AS_OF),
      monthKey,
      reports,
    }),
  );
  res.json({ ...summary, currency: "ILS", demo: true });
});

router.get("/report", (req, res) => {
  const month = req.query.month as string | undefined;
  res.json(getDemoReport(month));
});

router.get("/kaspa", async (req, res) => {
  try {
    const force = req.query.refresh === "1" || req.query.force === "1";
    res.json(await getDemoKaspaQuote({ force }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Kaspa price unavailable";
    res.status(502).json({ error: message });
  }
});

router.get("/fxcn", async (req, res) => {
  try {
    const force = req.query.refresh === "1" || req.query.force === "1";
    res.json(await getDemoFxcnQuote({ force }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "FXCN NAV unavailable";
    res.status(502).json({ error: message });
  }
});

router.get("/market-snapshot", async (req, res) => {
  try {
    const force = req.query.refresh === "1" || req.query.force === "1";
    res.json(await getMarketSnapshot({ force }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Market snapshot unavailable";
    res.status(502).json({ error: message });
  }
});

router.get("/rules", (_req, res) => {
  res.json(demoRules());
});

router.get("/fixed-charges", (_req, res) => {
  res.json(demoFixedCharges());
});

router.put("/fixed-charges", (_req, res) => {
  res.status(403).json({ error: "Fixed charges disabled in demo mode" });
});

router.get("/living-budget", (_req, res) => {
  res.json(demoLivingBudget());
});

router.put("/living-budget", (_req, res) => {
  res.status(403).json({ error: "Living budget disabled in demo mode" });
});

router.get("/review/queue", (_req, res) => {
  res.json(demoReviewQueue());
});

router.get("/review/progress", (_req, res) => {
  res.json({ reviewed_transactions: [] });
});

router.post("/sync", (_req, res) => {
  res.json({
    synced: [],
    total_months: demoMonthCatalog().length,
    demo: true,
    message: "Demo mode — upload your own Leumi xlsx after sign-in",
  });
});

router.post("/upload", (_req, res) => {
  res.status(403).json({ error: "Upload disabled in demo mode — sign in to use your statements" });
});

router.delete("/statements/:key", (_req, res) => {
  res.status(403).json({ error: "Deleting statements disabled in demo mode — sign in to manage your data" });
});

router.put("/rules", (_req, res) => {
  res.status(403).json({ error: "Saving rules disabled in demo mode" });
});

router.post("/review/confirm", (_req, res) => {
  res.json({ ok: true, demo: true });
});

router.get("/exclusions", (_req, res) => {
  res.json({ ...demoExclusions(), demo: true });
});

router.post("/exclusions", (_req, res) => {
  res.status(403).json({ error: "Exclusions disabled in demo mode" });
});

router.post("/exclusions/remove", (_req, res) => {
  res.status(403).json({ error: "Exclusions disabled in demo mode" });
});

router.get("/adjustments", (_req, res) => {
  res.json({ entries: [], total: 0, demo: true });
});

router.post("/adjustments", (_req, res) => {
  res.status(403).json({ error: "Adjustments disabled in demo mode" });
});

router.post("/adjustments/remove", (_req, res) => {
  res.status(403).json({ error: "Adjustments disabled in demo mode" });
});

export default router;
