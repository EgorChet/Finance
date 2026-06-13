import { Router } from "express";
import multer from "multer";
import { promises as fs } from "fs";
import path from "path";
import { analyzeFileBuffer, reanalyzeAll, translateMerchant, warmAnalyzer } from "../services/analyzerClient.js";
import { augmentReport } from "../services/fixedCharges.js";
import {
  getCombinedReport,
  isCachedFile,
  monthCatalog,
  rememberReport,
  applyMerchantRules,
  summaryRows,
} from "../services/reportService.js";
import {
  buildReviewQueue,
  merchantCatalog,
  normalizeReviewKey,
  suggestEnglish,
  transactionKey,
} from "../services/reviewService.js";
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
import type { MerchantRules } from "../types.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.get("/health", async (req, res) => {
  const deep = req.query.deep === "1" || req.query.deep === "true";
  if (!deep) {
    res.json({ status: "ok" });
    return;
  }
  const analyzer = await warmAnalyzer();
  res.json({ status: "ok", analyzer });
});

function sanitizeUploadFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ]+/g, "").trim() || "upload.xlsx";
  return base.toLowerCase().endsWith(".xlsx") ? base : `${base}.xlsx`;
}

router.get("/months", async (_req, res) => {
  const data = await readStatements();
  const catalog = monthCatalog(data).sort((a, b) => b.key.localeCompare(a.key));
  res.json({ months: catalog, summary: summaryRows(data) });
});

router.get("/report", async (req, res) => {
  const data = await readStatements();
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const month = req.query.month as string | undefined;

  let keys: string[] | null = null;
  if (month) {
    keys = [month];
  } else if (from && to) {
    keys = monthCatalog(data)
      .map((m) => m.key)
      .filter((k) => k >= from && k <= to);
  }

  const report = getCombinedReport(data, keys);
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
  const { loadFixedCharges } = await import("../services/fixedCharges.js");
  res.json({ charges: loadFixedCharges() });
});

router.put("/rules", async (req, res) => {
  const rules = req.body as MerchantRules;
  await writeRules(rules);
  const statements = await readStatements();
  const updated = applyMerchantRules(statements, rules);
  await writeStatements(statements);
  res.json({ saved: true, updated_transactions: updated });
});

router.post("/rules/entry", async (req, res) => {
  const { hebrew, english, category } = req.body as {
    hebrew: string;
    english: string;
    category?: string;
  };
  const rules = await readRules();
  rules[hebrew] = { english, category: category || null };
  await writeRules(rules);
  const statements = await readStatements();
  const updated = applyMerchantRules(statements, rules);
  await writeStatements(statements);
  res.json({ ok: true, updated_transactions: updated });
});

router.get("/merchants", async (req, res) => {
  const data = await readStatements();
  const rules = await readRules();
  const month = req.query.month as string | undefined;
  const keys = month ? [month] : null;
  const report = getCombinedReport(data, keys);
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
    await writeStatements(data);
  } else {
    const result = await reanalyzeAll(data, rules, autoTranslate);
    data.statements = result.statements;
    await writeStatements(data);
  }

  res.json({ synced, total_months: Object.keys(data.statements).length });
});

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const autoTranslate = req.body?.auto_translate !== "false";
  const filename = sanitizeUploadFilename(req.file.originalname || "upload.xlsx");
  const buffer = req.file.buffer;
  const hash = fileHash(buffer);

  try {
    const data = await readStatements();
    if (isCachedFile(data, hash)) {
      res.json({ skipped: true, reason: "unchanged" });
      return;
    }

    const rules = await readRules();
    const report = await analyzeFileBuffer(buffer, filename, autoTranslate);
    const savedPath = await saveUploadedXlsx(filename, buffer);
    const key = rememberReport(data, report, savedPath, filename, hash);
    applyMerchantRules(data, rules);
    await writeStatements(data);
    res.json({ key, report: augmentReport(data.statements[key]!.report) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const warming =
      message.includes("abort") ||
      message.includes("fetch failed") ||
      message.includes("ECONNREFUSED") ||
      message.includes("Analyzer error");
    console.error("Upload failed:", message);
    res.status(warming ? 503 : 500).json({
      error: warming
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
  const rules = await readRules();
  const progress = await readReviewProgress();
  const reviewed = new Set(progress.reviewed_transactions.map(normalizeReviewKey));
  const reviewedMerchants = new Set(progress.reviewed_merchants || []);

  const month = req.query.month as string | undefined;
  const keys = month ? [month] : null;
  const report = getCombinedReport(data, keys);
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
  rules[hebrew] = { english, category: category || null };
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
          reviewed.add(transactionKey(tx));
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
