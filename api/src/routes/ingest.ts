import express, { Router } from "express";
import multer from "multer";
import { warmAnalyzerDetailed } from "../services/analyzerClient.js";
import {
  ingestStatementBuffer,
  parseStatementType,
  uploadErrorResponse,
} from "../services/statementUpload.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

/** Brief warmup budget per HTTP call — Apps Script polls this on free-tier cold starts. */
const WAKE_HTTP_ATTEMPTS = Number(process.env.ANALYZER_WAKE_HTTP_ATTEMPTS || 3);

/** Wake analyzer before uploading — Apps Script should call this with retries on free tier. */
router.get("/wake", async (_req, res) => {
  const result = await warmAnalyzerDetailed({ maxAttempts: WAKE_HTTP_ATTEMPTS });
  if (!result.ready) {
    res.status(503).json({
      ready: false,
      error: result.error || "Analyzer not ready",
      attempts: result.attempts,
      analyzer_url: result.analyzerUrl,
    });
    return;
  }
  res.json({ ready: true, attempts: result.attempts, analyzer_url: result.analyzerUrl });
});

/**
 * Cal SMS login codes, relayed by an iPhone Shortcut and read by the Mac Cal sync.
 * Kept in memory only, for a few minutes; nothing is written to storage.
 */
const OTP_TTL_MS = 5 * 60_000;
let latestOtp: { code: string; at: number } | null = null;

function extractOtp(value: unknown): string | null {
  const text = typeof value === "string" ? value : "";
  // Prefer a 4–8 digit run; SMS bodies also contain card digits, so take the longest-ish code-looking run.
  const candidates = text.match(/\b\d{4,8}\b/g) || [];
  if (!candidates.length) return null;
  return candidates.find((c) => c.length === 6) || candidates[0]!;
}

/** iPhone Shortcut: POST { code } or { text: "<whole SMS>" } (JSON, form or plain text body). */
router.post("/otp", express.text({ type: "text/*" }), express.urlencoded({ extended: false }), (req, res) => {
  const body = req.body as unknown;
  const code =
    typeof body === "string"
      ? extractOtp(body)
      : extractOtp((body as { code?: unknown })?.code) || extractOtp((body as { text?: unknown })?.text);
  if (!code) {
    res.status(400).json({ error: "No code found. Send { code } or { text } with the SMS." });
    return;
  }
  latestOtp = { code, at: Date.now() };
  res.json({ ok: true });
});

/** Mac Cal sync: GET ?since=<epoch ms> → the newest code received after that moment (read once). */
router.get("/otp", (req, res) => {
  const since = Number(req.query.since || 0);
  const otp = latestOtp;
  if (!otp || Date.now() - otp.at > OTP_TTL_MS || otp.at < since) {
    res.status(204).end();
    return;
  }
  latestOtp = null;
  res.json({ code: otp.code, received_at: otp.at });
});

/**
 * TEMPORARY: can this server reach Cal at all? Plain request, no browser, no login.
 * Cal answers data-center addresses with 403; a home connection gets 200.
 */
router.get("/cal-reachability", async (_req, res) => {
  const targets = ["https://digital-web.cal-online.co.il/login", "https://www.cal-online.co.il/"];
  const results = [];
  for (const url of targets) {
    try {
      const r = await fetch(url, {
        headers: { "Accept-Language": "he-IL,he;q=0.9,en;q=0.8", Accept: "text/html" },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      const body = await r.text();
      const title = body.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() || "";
      results.push({ url, status: r.status, title: title.slice(0, 80) });
    } catch (e) {
      results.push({ url, error: e instanceof Error ? e.message : String(e) });
    }
  }
  res.json({ results });
});

/**
 * Machine ingest for Drive automation.
 * multipart: file + statement_type=partial|final (+ optional auto_translate)
 */
router.post("/", upload.single("file"), async (req, res) => {
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
    console.error("Ingest failed:", error);
    res.status(status).json({ error });
  }
});

export default router;
