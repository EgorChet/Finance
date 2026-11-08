import { timingSafeEqual } from "crypto";
import { Router, type Request, type Response } from "express";
import { userCanEdit, userIdFromRequest } from "../auth.js";
import { getCalSyncJob, startCalSync } from "../services/calSyncService.js";

const router = Router();

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** True when the response was already sent. */
function cronAuthorized(req: Request, res: Response): boolean {
  const raw = req.headers["x-assistant-key"];
  const provided = (Array.isArray(raw) ? raw[0] : raw)?.trim() || "";
  const expected = process.env.ASSISTANT_KEY?.trim() || "";
  if (!expected) {
    res.status(503).json({ error: "Set ASSISTANT_KEY on the API server" });
    return false;
  }
  if (!provided || !safeEqual(provided, expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

/**
 * Totoshka starts the hourly sync. Returns immediately with a job id.
 * The work continues in the background. Poll handleCalCronStatus until done or error.
 */
export function handleCalCron(req: Request, res: Response): void {
  if (!cronAuthorized(req, res)) return;
  try {
    res.status(202).json(startCalSync());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(/CAL_USERNAME|CAL_PASSWORD/.test(message) ? 503 : 500).json({ error: message });
  }
}

/** Same key as handleCalCron. 200 with the job, including status done or error. */
export function handleCalCronStatus(req: Request, res: Response): void {
  if (!cronAuthorized(req, res)) return;
  const job = getCalSyncJob(String(req.params.jobId || ""));
  if (!job) {
    res.status(404).json({ error: "Cal sync job not found. The server may have restarted." });
    return;
  }
  res.json(job);
}

/** Phone button: start the server-side Cal sync. Returns immediately; poll GET /sync/:jobId. */
router.post("/sync", (req, res) => {
  if (!userCanEdit(userIdFromRequest(req))) {
    res.status(403).json({ error: "Only Egor can sync Cal." });
    return;
  }
  try {
    res.status(202).json(startCalSync());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(/CAL_USERNAME|CAL_PASSWORD/.test(message) ? 503 : 500).json({ error: message });
  }
});

router.get("/sync/:jobId", (req, res) => {
  if (!userCanEdit(userIdFromRequest(req))) {
    res.status(403).json({ error: "Only Egor can sync Cal." });
    return;
  }
  const job = getCalSyncJob(String(req.params.jobId || ""));
  if (!job) {
    res.status(404).json({ error: "Cal sync job not found. The server may have restarted — tap Sync Cal again." });
    return;
  }
  res.json(job);
});

export default router;
