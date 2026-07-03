import { Router } from "express";
import {
  DEMO_AS_OF,
  demoExclusions,
  demoFixedCharges,
  demoLivingBudget,
  demoMerchants,
  demoMonthCatalog,
  demoReviewQueue,
  demoRules,
  demoSummaryRows,
  demoCalendar,
  getDemoReport,
} from "../data/demoData.js";
import { combineReports } from "../services/reportService.js";
import { getDemoFxcnQuote, getDemoKaspaQuote } from "../services/demoPortfolio.js";
import { getMarketSnapshot } from "../services/marketSnapshot.js";

const router = Router();

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
    fixed_charges: demoFixedCharges(),
    living_budget: { segments: budget.segments, month_topups: budget.month_topups || [] },
    demo_as_of: DEMO_AS_OF,
  });
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

router.get("/merchants", (_req, res) => {
  res.json(demoMerchants());
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

router.get("/calendar", (_req, res) => {
  res.json(demoCalendar());
});

router.post("/calendar/events", (_req, res) => {
  res.status(403).json({ error: "Calendar disabled in demo mode" });
});

router.put("/calendar/events/:id", (_req, res) => {
  res.status(403).json({ error: "Calendar disabled in demo mode" });
});

router.delete("/calendar/events/:id", (_req, res) => {
  res.status(403).json({ error: "Calendar disabled in demo mode" });
});

router.post("/calendar/regenerate-token", (_req, res) => {
  res.status(403).json({ error: "Calendar disabled in demo mode" });
});

export default router;
