import { Router } from "express";
import multer from "multer";
import { promises as fs } from "fs";
import path from "path";
import { analyzeFileBuffer, analyzerUsesPublicUrl, isPublicRenderAnalyzerUrl, normalizeAnalyzerUrl, reanalyzeAll, translateMerchant, warmAnalyzer } from "../services/analyzerClient.js";
import {
  deleteStatementByKey,
  DEFAULT_PACE_MONTHS,
  finalizeStatementByKey,
  getCombinedReportAsync,
  getPaceBundleAsync,
  isCachedFile,
  monthCatalog,
  rememberReport,
  repairMiskeyedStatements,
  isSafeStatementKey,
  applyMerchantRules,
  reprocessAllStatements,
  recentBillingKeys,
  summaryRows,
} from "../services/reportService.js";
import {
  ingestStatementBuffer,
  parseStatementType,
  uploadErrorResponse,
} from "../services/statementUpload.js";
import { createUploadJob, getUploadJob } from "../services/uploadJobs.js";
import { getFinalizeVersion } from "../services/finalizeVersion.js";
import {
  buildReviewQueue,
  normalizeReviewKey,
  suggestEnglish,
  transactionKey as reviewTransactionKey,
} from "../services/reviewService.js";
import { normalizeMerchantRules } from "../utils/merchantVendor.js";
import {
  discoverXlsxFiles,
  fileHash,
  readReviewProgress,
  readRules,
  readStatements,
  writeReviewProgress,
  writeRules,
  writeStatements,
} from "../storage/index.js";
import {
  addExclusion,
  listExclusions,
  removeExclusion,
  transactionKey,
} from "../services/exclusions.js";
import {
  listAdjustments,
  removeAdjustment,
  upsertAdjustment,
} from "../services/adjustments.js";
import {
  loadFixedCharges,
  saveFixedCharges,
  validateFixedCharges,
} from "../services/fixedCharges.js";
import {
  loadLivingBudgetData,
  loadLivingBudgetSegments,
  saveLivingBudget,
  validateLivingBudget,
} from "../services/livingBudget.js";
import { ensureAuxCachesFresh } from "../middleware/auxCache.js";
import { getKaspaQuote } from "../services/kaspaPrice.js";
import { getFxcnQuote } from "../services/fxcnQuote.js";
import { getMarketSnapshot } from "../services/marketSnapshot.js";
import type { FixedCharge, LivingBudgetMonthTopup, LivingBudgetSegment, MerchantRules } from "../types.js";
import { readPaceSettings, writePaceSettings } from "../storage/index.js";
import { normalizePaceSettings, withPaceSettings, type PaceSettings } from "../../../core/spending/paceSettings.js";
import { computeSpendingSummary } from "../../../core/summary.js";
import type { MonthItem as CoreMonthItem, SpendingReport as CoreSpendingReport } from "../../../core/types.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.use(async (_req, _res, next) => {
  try {
    await ensureAuxCachesFresh();
    next();
  } catch (e) {
    next(e);
  }
});

router.get("/health", async (req, res) => {
  const deep = req.query.deep === "1" || req.query.deep === "true";
  if (!deep) {
    res.json({ status: "ok" });
    return;
  }
  const analyzer = await warmAnalyzer({ maxAttempts: 2 });
  res.json({ status: "ok", analyzer, analyzer_url: process.env.ANALYZER_URL ? "set" : "missing" });
});

/** Brief wake poll — clients should retry; do not block for a full cold start here. */
router.get("/warm-analyzer", async (_req, res) => {
  const ready = await warmAnalyzer({ maxAttempts: Number(process.env.ANALYZER_WAKE_HTTP_ATTEMPTS || 3) });
  if (!ready) {
    res.status(503).json({ ready: false, error: "Analyzer not ready" });
    return;
  }
  res.json({ ready: true });
});

router.get("/config", (_req, res) => {
  const url = normalizeAnalyzerUrl(process.env.ANALYZER_URL);
  res.json({
    analyzer_wake_url: isPublicRenderAnalyzerUrl(url) ? url : null,
    analyzer_wake_from_browser: analyzerUsesPublicUrl(),
  });
});

router.get("/kaspa", async (req, res) => {
  try {
    const force = req.query.refresh === "1" || req.query.force === "1";
    res.json(await getKaspaQuote({ force }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Kaspa price unavailable";
    res.status(502).json({ error: message });
  }
});

router.get("/fxcn", async (req, res) => {
  try {
    const force = req.query.refresh === "1" || req.query.force === "1";
    res.json(await getFxcnQuote({ force }));
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

router.get("/months", async (_req, res) => {
  const data = await loadStatementsRepaired();
  const version = await getFinalizeVersion();
  const catalog = monthCatalog(data).sort((a, b) => b.key.localeCompare(a.key));
  res.json({ months: catalog, summary: summaryRows(data, version) });
});

/** Single round-trip for Home: months + scoped pace report + fixed charges + living budget. */
router.get("/home-data", async (req, res) => {
  const data = await loadStatementsRepaired();
  const version = await getFinalizeVersion();
  const months = monthCatalog(data).sort((a, b) => b.key.localeCompare(a.key));
  const paceMonths = Math.max(1, Number(req.query.pace_months ?? DEFAULT_PACE_MONTHS));
  const paceKeys = recentBillingKeys(data, paceMonths);
  const { report, scopedReports } = await getPaceBundleAsync(data, paceKeys, version);
  const budget = loadLivingBudgetData();
  // lean=1: the client rebuilds the combined history from scoped_reports (halves the payload).
  const lean = req.query.lean === "1";
  res.json({
    months,
    summary: summaryRows(data, version),
    report: lean ? null : report ?? null,
    scoped_reports: scopedReports,
    pace_keys: paceKeys,
    pace_months: paceKeys.length,
    pace_months_requested: paceMonths,
    fixed_charges: loadFixedCharges(),
    living_budget: { segments: budget.segments, month_topups: budget.month_topups || [] },
  });
});

/** Household pace settings (cycle day, pace options, manual cycle spend), shared by all devices. */
async function loadPaceSettings(): Promise<PaceSettings> {
  return normalizePaceSettings(await readPaceSettings());
}

router.get("/settings", async (_req, res) => {
  res.json(await loadPaceSettings());
});

router.put("/settings", async (req, res) => {
  const next = normalizePaceSettings({ ...(req.body as object), updated_at: new Date().toISOString() });
  await writePaceSettings(next as unknown as Record<string, unknown>);
  res.json(next);
});

/** "Now" as the wall clock in Israel, where the household and its billing cycle live. */
function householdNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
}

/**
 * The Home screen's numbers, computed with the same shared code as the app:
 * budget cap, spent, money left, daily budget and pace for a month or the open cycle.
 * Query: month=<month key or cycle:YYYY-MM-DD> (optional, defaults to what Home opens on).
 */
router.get("/summary", async (req, res) => {
  const data = await loadStatementsRepaired();
  const version = await getFinalizeVersion();
  const months = monthCatalog(data).sort((a, b) => b.key.localeCompare(a.key)) as unknown as CoreMonthItem[];
  const paceKeys = recentBillingKeys(data, DEFAULT_PACE_MONTHS);
  const { report: paceReport, scopedReports } = await getPaceBundleAsync(data, paceKeys, version);
  const settings = await loadPaceSettings();
  const budget = loadLivingBudgetData();
  const reports: Record<string, CoreSpendingReport | undefined> = {
    ...(scopedReports as unknown as Record<string, CoreSpendingReport>),
  };
  // Load every partial snapshot and the requested month, in case they are outside the pace window.
  const wanted = new Set<string>(months.filter((m) => m.partial).map((m) => m.key));
  const monthKey = typeof req.query.month === "string" && req.query.month.trim() ? req.query.month.trim() : null;
  if (monthKey && !monthKey.startsWith("cycle:")) wanted.add(monthKey);
  for (const key of wanted) {
    if (reports[key]) continue;
    const r = await getCombinedReportAsync(data, [key], version);
    if (r) reports[key] = r as unknown as CoreSpendingReport;
  }
  const summary = withPaceSettings(settings, () =>
    computeSpendingSummary({
      months,
      paceReport: (paceReport ?? null) as unknown as CoreSpendingReport | null,
      fixedCharges: loadFixedCharges() as unknown as Parameters<typeof computeSpendingSummary>[0]["fixedCharges"],
      livingBudget: { segments: budget.segments, month_topups: budget.month_topups || [] },
      referenceDate: householdNow(),
      monthKey,
      reports,
    }),
  );
  res.json({ ...summary, currency: "ILS", settings: { cycle_day: settings.cycle_day } });
});

async function loadStatementsRepaired(): Promise<Awaited<ReturnType<typeof readStatements>>> {
  const data = await readStatements();
  const repaired = repairMiskeyedStatements(data);
  if (repaired > 0) {
    await writeStatements(data);
  }
  return data;
}

router.delete("/statements/:key", async (req, res) => {
  const key = decodeURIComponent(String(req.params.key || "").trim());
  if (!isSafeStatementKey(key)) {
    res.status(400).json({ error: "Invalid statement key" });
    return;
  }
  const data = await readStatements();
  if (!deleteStatementByKey(data, key)) {
    res.status(404).json({ error: "Statement not found" });
    return;
  }
  await writeStatements(data);
  res.json({ ok: true, key, total_months: Object.keys(data.statements).length });
});

router.get("/report", async (req, res) => {
  const data = await loadStatementsRepaired();
  const version = await getFinalizeVersion();
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const month = req.query.month as string | undefined;
  const monthsParam = req.query.months as string | undefined;

  let keys: string[] | null = null;
  if (month) {
    keys = [month];
  } else if (from && to) {
    keys = monthCatalog(data)
      .map((m) => m.key)
      .filter((k) => k >= from && k <= to);
  } else if (monthsParam) {
    const count = Math.max(1, Number(monthsParam));
    keys = recentBillingKeys(data, count);
  }

  const report = await getCombinedReportAsync(data, keys, version);
  if (!report) {
    res.status(404).json({ error: "No statements found" });
    return;
  }
  res.json(report);
});

router.get("/rules", async (_req, res) => {
  res.json(await readRules());
});

router.get("/fixed-charges", async (_req, res) => {
  res.json({ charges: loadFixedCharges() });
});

router.put("/fixed-charges", async (req, res) => {
  const body = req.body as { charges?: FixedCharge[] };
  const charges = body.charges;
  if (!Array.isArray(charges)) {
    res.status(400).json({ error: "charges array required" });
    return;
  }
  const error = validateFixedCharges(charges);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  const saved = await saveFixedCharges(charges);
  res.json({ saved: true, charges: saved });
});

router.get("/living-budget", async (_req, res) => {
  const data = loadLivingBudgetData();
  res.json({ segments: data.segments, month_topups: data.month_topups || [] });
});

router.put("/living-budget", async (req, res) => {
  const body = req.body as { segments?: LivingBudgetSegment[]; month_topups?: LivingBudgetMonthTopup[] };
  const segments = body.segments;
  const monthTopups = Array.isArray(body.month_topups) ? body.month_topups : [];
  if (!Array.isArray(segments)) {
    res.status(400).json({ error: "segments array required" });
    return;
  }
  const charges = loadFixedCharges();
  const error = validateLivingBudget(segments, monthTopups, charges);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  const saved = await saveLivingBudget(segments, monthTopups, charges);
  res.json({ saved: true, segments: saved.segments, month_topups: saved.month_topups || [] });
});

router.get("/exclusions", async (_req, res) => {
  const entries = await listExclusions();
  res.json({ entries, total: entries.length });
});

router.post("/exclusions", async (req, res) => {
  const { key, note, transaction } = req.body as {
    key?: string;
    note?: string;
    transaction?: { date: string; merchant_he: string; charge_amount: number };
  };
  const resolvedKey =
    key?.trim() ||
    (transaction ? transactionKey(transaction as import("../types.js").Transaction) : "");
  if (!resolvedKey) {
    res.status(400).json({ error: "key or transaction required" });
    return;
  }
  const entry = await addExclusion(resolvedKey, note);
  res.json({ ok: true, entry });
});

router.post("/exclusions/remove", async (req, res) => {
  const { key } = req.body as { key?: string };
  if (!key?.trim()) {
    res.status(400).json({ error: "key required" });
    return;
  }
  await removeExclusion(key);
  res.json({ ok: true });
});

router.get("/adjustments", async (_req, res) => {
  const entries = await listAdjustments();
  res.json({ entries, total: entries.length });
});

router.post("/adjustments", async (req, res) => {
  const { key, reimbursement, note, transaction } = req.body as {
    key?: string;
    reimbursement?: number;
    note?: string;
    transaction?: { date: string; merchant_he: string; charge_amount: number };
  };
  const resolvedKey =
    key?.trim() ||
    (transaction ? transactionKey(transaction as import("../types.js").Transaction) : "");
  if (!resolvedKey) {
    res.status(400).json({ error: "key or transaction required" });
    return;
  }
  if (reimbursement == null || !Number.isFinite(Number(reimbursement))) {
    res.status(400).json({ error: "reimbursement required" });
    return;
  }
  const entry = await upsertAdjustment(resolvedKey, Number(reimbursement), note);
  res.json({ ok: true, entry });
});

router.post("/adjustments/remove", async (req, res) => {
  const { key } = req.body as { key?: string };
  if (!key?.trim()) {
    res.status(400).json({ error: "key required" });
    return;
  }
  await removeAdjustment(key);
  res.json({ ok: true });
});

router.put("/rules", async (req, res) => {
  try {
    const rules = normalizeMerchantRules(req.body as MerchantRules);
    await writeRules(rules);
    const persisted = normalizeMerchantRules(await readRules());
    const sent = JSON.stringify(rules, Object.keys(rules).sort());
    const got = JSON.stringify(persisted, Object.keys(persisted).sort());
    if (sent !== got) {
      res.status(500).json({
        error: "Merchant rules did not persist — check that Render has deployed the latest API and Supabase credentials are set.",
      });
      return;
    }
    const statements = await readStatements();
    const version = await getFinalizeVersion();
    const updated = await applyMerchantRules(statements, rules, version);
    await writeStatements(statements);
    res.json({ saved: true, updated_transactions: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Save failed";
    res.status(500).json({ error: message });
  }
});

router.post("/rules/entry", async (req, res) => {
  try {
    const { hebrew, english, category } = req.body as {
      hebrew: string;
      english: string;
      category?: string;
    };
    if (!hebrew?.trim()) {
      res.status(400).json({ error: "hebrew required" });
      return;
    }
    const rules = await readRules();
    rules[hebrew.trim()] = {
      english: (english || "").trim(),
      category: category || null,
    };
    await writeRules(rules);
    const statements = await readStatements();
    const version = await getFinalizeVersion();
    const updated = await applyMerchantRules(statements, rules, version);
    await writeStatements(statements);
    res.json({ ok: true, updated_transactions: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Save failed";
    res.status(500).json({ error: message });
  }
});

router.post("/sync", async (req, res) => {
  const autoTranslate = req.body?.auto_translate !== false;
  const data = await readStatements();
  const rules = await readRules();
  const files = await discoverXlsxFiles();
  const synced: string[] = [];

  for (const filePath of files) {
    const buffer = await fs.readFile(filePath);
    const hash = fileHash(buffer);
    if (isCachedFile(data, hash)) continue;
    const report = await analyzeFileBuffer(buffer, path.basename(filePath), autoTranslate);
    const key = rememberReport(data, report, filePath, path.basename(filePath), hash);
    synced.push(key);
  }

  if (synced.length) {
    const version = await getFinalizeVersion();
    for (const key of synced) {
      await finalizeStatementByKey(data, key, rules, version);
    }
    await writeStatements(data);
  } else {
    const result = await reanalyzeAll(data, rules, autoTranslate);
    data.statements = result.statements;
    await writeStatements(data);
  }

  res.json({ synced, total_months: Object.keys(data.statements).length });
});

/** Re-apply refund/FX normalization to stored statements (no re-upload). */
router.post("/statements/reprocess", async (_req, res) => {
  const data = await readStatements();
  const { updated } = await reprocessAllStatements(data);
  if (updated > 0) {
    await writeStatements(data);
  }
  res.json({ ok: true, updated, total_months: Object.keys(data.statements).length });
});

/** Sync upload — kept for scripts / fallbacks. Prefer /upload/jobs for the app. */
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const statementType = parseStatementType(req.body?.statement_type);
  if (!statementType) {
    res.status(400).json({ error: "statement_type must be partial or final" });
    return;
  }
  const autoTranslate = req.body?.auto_translate !== "false";
  try {
    const result = await ingestStatementBuffer(
      req.file.buffer,
      req.file.originalname || "upload.xlsx",
      statementType,
      autoTranslate,
    );
    res.json(result);
  } catch (e) {
    const { status, error } = uploadErrorResponse(e);
    console.error("Upload failed:", error);
    res.status(status).json({ error });
  }
});

/** Background upload — returns immediately; poll GET /upload/jobs/:jobId */
router.post("/upload/jobs", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const statementType = parseStatementType(req.body?.statement_type);
  if (!statementType) {
    res.status(400).json({ error: "statement_type must be partial or final" });
    return;
  }
  const autoTranslate = req.body?.auto_translate !== "false";
  try {
    const job = await createUploadJob({
      buffer: req.file.buffer,
      filename: req.file.originalname || "upload.xlsx",
      statementType,
      autoTranslate,
    });
    res.status(202).json(job);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Create upload job failed:", message);
    res.status(500).json({ error: message });
  }
});

router.get("/upload/jobs/:jobId", async (req, res) => {
  const jobId = req.params.jobId?.trim();
  if (!jobId) {
    res.status(400).json({ error: "jobId required" });
    return;
  }
  const job = await getUploadJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

router.get("/review/progress", async (_req, res) => {
  res.json(await readReviewProgress());
});

router.put("/review/progress", async (req, res) => {
  await writeReviewProgress(req.body);
  res.json({ ok: true });
});

router.post("/review/progress/reset", async (_req, res) => {
  await writeReviewProgress({ reviewed_transactions: [], reviewed_merchants: [] });
  res.json({ ok: true });
});

router.get("/review/queue", async (req, res) => {
  const data = await readStatements();
  const version = await getFinalizeVersion();
  const rules = await readRules();
  const progress = await readReviewProgress();
  const reviewed = new Set(progress.reviewed_transactions.map(normalizeReviewKey));
  const reviewedMerchants = new Set(progress.reviewed_merchants || []);

  const month = req.query.month as string | undefined;
  const keys = month ? [month] : null;
  const report = await getCombinedReportAsync(data, keys, version);
  if (!report) {
    res.json({ queue: [], total: 0, reviewed_count: 0 });
    return;
  }

  const queue = buildReviewQueue(report, rules, reviewed, {
    includeReviewed: req.query.include_reviewed === "true",
    includeLabeled: req.query.include_labeled === "true",
    onePerMerchant: req.query.one_per_merchant !== "false",
    reviewedMerchants,
  });

  res.json({
    queue,
    total: queue.length,
    reviewed_count: reviewed.size + reviewedMerchants.size,
  });
});

router.get("/review/suggest", async (req, res) => {
  const hebrew = (req.query.hebrew as string | undefined)?.trim();
  if (!hebrew) {
    res.status(400).json({ error: "hebrew query required" });
    return;
  }
  const rules = await readRules();
  const fromRules = suggestEnglish(hebrew, rules);
  if (fromRules) {
    res.json({ english: fromRules });
    return;
  }
  const english = await translateMerchant(hebrew);
  res.json({ english });
});

router.post("/review/confirm", async (req, res) => {
  const { hebrew, english, category, mark_all_merchant } = req.body as {
    hebrew: string;
    english: string;
    category?: string;
    keys?: string[];
    mark_all_merchant?: boolean;
  };

  const rules = await readRules();
  rules[hebrew] = {
    english: (english || "").trim(),
    category: category || null,
  };
  await writeRules(rules);

  const statements = await readStatements();
  const progress = await readReviewProgress();
  const reviewed = new Set(progress.reviewed_transactions.map(normalizeReviewKey));
  const reviewedMerchants = new Set(progress.reviewed_merchants || []);

  if (mark_all_merchant) {
    reviewedMerchants.add(hebrew);
    for (const entry of Object.values(statements.statements)) {
      for (const tx of entry.report.transactions) {
        if (tx.merchant_he === hebrew) {
          reviewed.add(reviewTransactionKey(tx));
        }
      }
    }
  } else if (req.body.keys) {
    for (const k of req.body.keys as string[]) {
      reviewed.add(normalizeReviewKey(k));
    }
  }

  await writeReviewProgress({
    reviewed_transactions: [...reviewed],
    reviewed_merchants: [...reviewedMerchants],
  });
  res.json({
    ok: true,
    reviewed_count: reviewed.size + reviewedMerchants.size,
  });

  // Apply saved rules to statements in the background (no auto-translate).
  void (async () => {
    try {
      const data = await readStatements();
      const latestRules = await readRules();
      const result = await reanalyzeAll(data, latestRules, false);
      data.statements = result.statements;
      await writeStatements(data);
    } catch (err) {
      console.error("Background reanalyze failed:", err);
    }
  })();
});

export default router;
