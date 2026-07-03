import { Router } from "express";
import multer from "multer";
import { promises as fs } from "fs";
import path from "path";
import { analyzeFileBuffer, analyzerUsesPublicUrl, isAnalyzerConnectivityError, isPublicRenderAnalyzerUrl, normalizeAnalyzerUrl, reanalyzeAll, translateMerchant, warmAnalyzer } from "../services/analyzerClient.js";
import {
  deleteStatementByKey,
  DEFAULT_PACE_MONTHS,
  finalizeStatementByKey,
  getCombinedReportAsync,
  isCachedFile,
  monthCatalog,
  normalizeProvisionalChargesAsync,
  rememberReport,
  applyMerchantRules,
  reprocessAllStatements,
  recentBillingKeys,
  summaryRows,
} from "../services/reportService.js";
import { getFinalizeVersion } from "../services/finalizeVersion.js";
import {
  buildReviewQueue,
  merchantCatalog,
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
  saveUploadedXlsx,
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
import {
  addCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  regenerateFeedToken,
  updateCalendarEvent,
} from "../services/calendarService.js";
import type { FixedCharge, LivingBudgetMonthTopup, LivingBudgetSegment, MerchantRules } from "../types.js";
import { userIdFromRequest } from "../auth.js";
import { calSyncEnabled } from "../storage/calCredentials.js";
import calRoutes from "./cal.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.use("/cal", calRoutes);

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
  const analyzer = await warmAnalyzer();
  res.json({ status: "ok", analyzer, analyzer_url: process.env.ANALYZER_URL ? "set" : "missing" });
});

/** Block until analyzer is awake — call before upload on Render free tier. */
router.get("/warm-analyzer", async (_req, res) => {
  const ready = await warmAnalyzer();
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
    cal_sync_enabled: calSyncEnabled(),
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

function sanitizeUploadFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ]+/g, "").trim() || "upload.xlsx";
  return base.toLowerCase().endsWith(".xlsx") ? base : `${base}.xlsx`;
}

router.get("/months", async (_req, res) => {
  const data = await readStatements();
  const version = await getFinalizeVersion();
  const catalog = monthCatalog(data).sort((a, b) => b.key.localeCompare(a.key));
  res.json({ months: catalog, summary: summaryRows(data, version) });
});

/** Single round-trip for Home: months + scoped pace report + fixed charges + living budget. */
router.get("/home-data", async (req, res) => {
  const data = await readStatements();
  const version = await getFinalizeVersion();
  const months = monthCatalog(data).sort((a, b) => b.key.localeCompare(a.key));
  const paceMonths = Math.max(1, Number(req.query.pace_months ?? DEFAULT_PACE_MONTHS));
  const paceKeys = recentBillingKeys(data, paceMonths);
  const report = await getCombinedReportAsync(data, paceKeys, version);
  const budget = loadLivingBudgetData();
  res.json({
    months,
    summary: summaryRows(data, version),
    report: report ?? null,
    pace_months: paceKeys.length,
    pace_months_requested: paceMonths,
    fixed_charges: loadFixedCharges(),
    living_budget: { segments: budget.segments, month_topups: budget.month_topups || [] },
  });
});

const STATEMENT_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

router.delete("/statements/:key", async (req, res) => {
  const key = String(req.params.key || "").trim();
  if (!STATEMENT_KEY_RE.test(key)) {
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
  const data = await readStatements();
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
  const error = validateLivingBudget(segments, monthTopups);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  const saved = await saveLivingBudget(segments, monthTopups);
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

router.get("/merchants", async (req, res) => {
  const data = await readStatements();
  const version = await getFinalizeVersion();
  const rules = await readRules();
  const month = req.query.month as string | undefined;
  const keys = month ? [month] : null;
  const report = await getCombinedReportAsync(data, keys, version);
  if (!report) {
    res.json([]);
    return;
  }
  res.json(merchantCatalog(report, rules));
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

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const autoTranslate = req.body?.auto_translate !== "false";
  const statementType = String(req.body?.statement_type || "").toLowerCase();
  if (statementType !== "partial" && statementType !== "final") {
    res.status(400).json({ error: "statement_type must be partial or final" });
    return;
  }
  const provisional = statementType === "partial";
  const filename = sanitizeUploadFilename(req.file.originalname || "upload.xlsx");
  const buffer = req.file.buffer;
  const hash = fileHash(buffer);

  try {
    const data = await readStatements();
    if (isCachedFile(data, hash) && !provisional) {
      res.json({ skipped: true, reason: "unchanged" });
      return;
    }

    const rules = await readRules();
    const report = await analyzeFileBuffer(buffer, filename, autoTranslate);
    const storedReport = provisional ? await normalizeProvisionalChargesAsync(report) : report;
    const savedPath = await saveUploadedXlsx(filename, buffer);
    const key = rememberReport(data, storedReport, savedPath, filename, hash, provisional);
    const version = await getFinalizeVersion();
    await finalizeStatementByKey(data, key, rules, version);
    await writeStatements(data);
    res.json({ key, provisional, report: data.statements[key]!.report });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const waking = isAnalyzerConnectivityError(message);
    console.error("Upload failed:", message);
    res.status(waking ? 503 : 500).json({
      error: waking
        ? "Analyzer is waking up (Render free tier). Wait ~30 seconds and try again."
        : message,
    });
  }
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

router.get("/calendar", async (_req, res) => {
  try {
    const data = await listCalendarEvents();
    res.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Calendar unavailable";
    res.status(500).json({ error: message });
  }
});

router.post("/calendar/events", async (req, res) => {
  const { title, date, all_day, start_time, end_time, importance, description, recurrence, created_by } = req.body as {
    title?: string;
    date?: string;
    all_day?: boolean;
    start_time?: string;
    end_time?: string;
    importance?: string;
    description?: string;
    recurrence?: string;
    created_by?: string;
  };
  if (!title?.trim() || !date?.trim()) {
    res.status(400).json({ error: "title and date required" });
    return;
  }
  try {
    const event = await addCalendarEvent(
      {
        title,
        date,
        all_day,
        start_time,
        end_time,
        importance: importance as import("../types.js").CalendarImportance,
        description,
        recurrence: recurrence as import("../types.js").CalendarRecurrence,
        created_by:
          created_by === "julia" || created_by === "egor"
            ? created_by
            : undefined,
      },
      userIdFromRequest(req),
    );
    res.json({ ok: true, event });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not add event";
    res.status(400).json({ error: message });
  }
});

router.put("/calendar/events/:id", async (req, res) => {
  const id = req.params.id?.trim();
  if (!id) {
    res.status(400).json({ error: "id required" });
    return;
  }
  const { title, date, all_day, start_time, end_time, importance, description, recurrence, created_by } = req.body as {
    title?: string;
    date?: string;
    all_day?: boolean;
    start_time?: string;
    end_time?: string;
    importance?: string;
    description?: string;
    recurrence?: string;
    created_by?: string;
  };
  if (!title?.trim() || !date?.trim()) {
    res.status(400).json({ error: "title and date required" });
    return;
  }
  try {
    const event = await updateCalendarEvent(id, {
      title,
      date,
      all_day,
      start_time,
      end_time,
      importance: importance as import("../types.js").CalendarImportance,
      description,
      recurrence: recurrence as import("../types.js").CalendarRecurrence,
      created_by: created_by === "julia" || created_by === "egor" ? created_by : undefined,
    });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json({ ok: true, event });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not update event";
    res.status(400).json({ error: message });
  }
});

router.delete("/calendar/events/:id", async (req, res) => {
  const id = req.params.id?.trim();
  if (!id) {
    res.status(400).json({ error: "id required" });
    return;
  }
  const removed = await deleteCalendarEvent(id);
  if (!removed) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json({ ok: true });
});

router.post("/calendar/regenerate-token", async (_req, res) => {
  try {
    const feed_token = await regenerateFeedToken();
    res.json({ ok: true, feed_token });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not regenerate token";
    res.status(500).json({ error: message });
  }
});

export default router;
