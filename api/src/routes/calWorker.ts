import { timingSafeEqual } from "crypto";
import { Router } from "express";
import multer from "multer";
import { warmAnalyzerDetailed } from "../services/analyzerClient.js";
import { claimServerJob, updateServerJob, type CalSyncJobPublic } from "../services/calSyncService.js";
import { ingestStatementBuffer } from "../services/statementUpload.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const STATUSES = new Set(["waking", "logging_in", "exporting", "uploading", "done", "error"]);

function workerKeyOk(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

router.use((req, res, next) => {
  const expected = process.env.CAL_WORKER_SECRET?.trim();
  if (!expected) {
    res.status(503).json({ error: "Set CAL_WORKER_SECRET on the API server" });
    return;
  }
  const provided = String(req.header("X-Cal-Worker-Key") || "");
  if (!provided || !workerKeyOk(provided, expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

/** Same check as GET /api/ingest/wake, so Totoshka does not need the ingest key. */
router.get("/wake", async (_req, res) => {
  const result = await warmAnalyzerDetailed({ maxAttempts: Number(process.env.ANALYZER_WAKE_HTTP_ATTEMPTS || 3) });
  if (!result.ready) {
    res.status(503).json({ ready: false, error: result.error || "Analyzer not ready" });
    return;
  }
  res.json({ ready: true, attempts: result.attempts });
});

/** Totoshka: take the next sync the phone asked to run on the server. 204 if none is waiting. */
router.post("/claim", (_req, res) => {
  const job = claimServerJob();
  if (!job) {
    res.status(204).end();
    return;
  }
  res.json(job);
});

/** Totoshka uploads the Excel here. The API saves it and marks the job done. */
router.post("/jobs/:jobId/file", upload.single("file"), async (req, res) => {
  const jobId = String(req.params.jobId || "");
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  updateServerJob(jobId, { status: "uploading", message: "Saving the statement…" });
  try {
    const result = await ingestStatementBuffer(req.file.buffer, req.file.originalname || "cal-export.xlsx", "partial", true);
    const job =
      "skipped" in result
        ? updateServerJob(jobId, { status: "done", message: "Statement unchanged", result: { skipped: true } })
        : updateServerJob(jobId, {
            status: "done",
            message: "Statement saved",
            result: { key: result.key, provisional: result.provisional },
          });
    if (!job) {
      res.status(404).json({ error: "Cal sync job not found" });
      return;
    }
    res.json(job);
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    const job = updateServerJob(jobId, { status: "error", message, error: message });
    res.status(500).json(job ?? { error: message });
  }
});

/** Totoshka: progress and the final result. The phone reads this through GET /api/cal/sync/:id. */
router.post("/jobs/:jobId", (req, res) => {
  const status = String(req.body?.status || "");
  if (!STATUSES.has(status)) {
    res.status(400).json({ error: "status must be waking, logging_in, exporting, uploading, done, or error" });
    return;
  }
  const message = String(req.body?.message || "").slice(0, 300);
  const error = req.body?.error ? String(req.body.error).slice(0, 300) : undefined;
  const result = req.body?.result as CalSyncJobPublic["result"];
  const job = updateServerJob(String(req.params.jobId || ""), { status: status as CalSyncJobPublic["status"], message, error, result });
  if (!job) {
    res.status(404).json({ error: "Cal sync job not found" });
    return;
  }
  res.json(job);
});

export default router;
