import { Router } from "express";
import {
  demoMerchants,
  demoMonthCatalog,
  demoReviewQueue,
  demoRules,
  demoSummaryRows,
  getDemoReport,
} from "../data/demoData.js";

const router = Router();

router.get("/months", (_req, res) => {
  res.json({
    months: demoMonthCatalog().sort((a, b) => b.key.localeCompare(a.key)),
    summary: demoSummaryRows(),
    demo: true,
  });
});

router.get("/report", (req, res) => {
  const month = req.query.month as string | undefined;
  res.json(getDemoReport(month));
});

router.get("/rules", (_req, res) => {
  res.json(demoRules());
});

router.get("/fixed-charges", (_req, res) => {
  res.json({ charges: [] });
});

router.put("/fixed-charges", (_req, res) => {
  res.status(403).json({ error: "Fixed charges disabled in demo mode" });
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
  res.json({ synced: [], total_months: 4, demo: true, message: "Demo mode — sync disabled" });
});

router.post("/upload", (_req, res) => {
  res.status(403).json({ error: "Upload disabled in demo mode" });
});

router.put("/rules", (_req, res) => {
  res.status(403).json({ error: "Saving rules disabled in demo mode" });
});

router.post("/review/confirm", (_req, res) => {
  res.json({ ok: true, demo: true });
});

router.get("/exclusions", (_req, res) => {
  res.json({ entries: [], total: 0, demo: true });
});

router.post("/exclusions", (_req, res) => {
  res.status(403).json({ error: "Exclusions disabled in demo mode" });
});

router.post("/exclusions/remove", (_req, res) => {
  res.status(403).json({ error: "Exclusions disabled in demo mode" });
});

export default router;
