import { Router } from "express";
import { userCanEdit, userIdFromRequest } from "../auth.js";
import { getCalSyncJob, startCalSync, type CalSyncTarget } from "../services/calSyncService.js";

const router = Router();

/** Phone button: start the server-side Cal sync. Returns immediately; poll GET /sync/:jobId. */
router.post("/sync", (req, res) => {
  if (!userCanEdit(userIdFromRequest(req))) {
    res.status(403).json({ error: "Only Egor can sync Cal." });
    return;
  }
  const target: CalSyncTarget = req.body?.target === "server" ? "server" : "render";
  try {
    res.status(202).json(startCalSync(target));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(/CAL_USERNAME|CAL_PASSWORD|CAL_WORKER_SECRET/.test(message) ? 503 : 500).json({ error: message });
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
