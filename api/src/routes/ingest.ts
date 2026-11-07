import { Router } from "express";
import multer from "multer";
import { warmAnalyzer } from "../services/analyzerClient.js";
import {
  ingestStatementBuffer,
  parseStatementType,
  uploadErrorResponse,
} from "../services/statementUpload.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

/** Wake analyzer before uploading — Apps Script should call this with retries on free tier. */
router.get("/wake", async (_req, res) => {
  const ready = await warmAnalyzer();
  if (!ready) {
    res.status(503).json({ ready: false, error: "Analyzer not ready" });
    return;
  }
  res.json({ ready: true });
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
