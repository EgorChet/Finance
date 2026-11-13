import compression from "compression";
import cors from "cors";
import express from "express";
import { warmAnalyzer, normalizeAnalyzerUrl, analyzerUsesPublicUrl } from "./services/analyzerClient.js";
import { requireAuth, requireIngestKey } from "./auth.js";
import { requireAuthOrAssistant } from "./assistantAuth.js";
import authRoutes from "./routes/auth.js";
import demoRoutes from "./routes/demo.js";
import ingestRoutes from "./routes/ingest.js";
import calRoutes, { handleCalCron, handleCalCronStatus } from "./routes/cal.js";
import apiRoutes from "./routes/index.js";

const PORT = Number(process.env.PORT || 3000);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (!allowedOrigins.length) return true;
  const normalized = origin.replace(/\/$/, "");
  return allowedOrigins.includes(normalized);
}

const app = express();
app.use(
  cors({
    origin(origin, callback) {
      callback(null, originAllowed(origin));
    },
  }),
);
// gzip JSON: the home bundle is ~700 KB raw, ~35 KB compressed.
app.use(compression());
app.use(express.json({ limit: "50mb" }));

app.get("/health", async (req, res) => {
  const deep = req.query.deep === "1" || req.query.deep === "true";
  if (!deep) {
    res.json({ status: "ok" });
    return;
  }
  // Brief check only — full cold-start waits belong on /api/ingest/wake + client retries.
  const analyzer = await warmAnalyzer({ maxAttempts: 2 });
  res.json({
    status: "ok",
    analyzer,
    analyzer_url: normalizeAnalyzerUrl(process.env.ANALYZER_URL),
    analyzer_env_set: !!process.env.ANALYZER_URL?.trim(),
    analyzer_uses_public_url: analyzerUsesPublicUrl(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/demo", demoRoutes);
/** Drive / Apps Script machine ingest — X-Ingest-Key, not household Bearer token. */
app.use("/api/ingest", requireIngestKey, ingestRoutes);

/** Totoshka hourly trigger. POST starts the job and returns its id. GET polls that id. */
app.post("/api/cal/cron", handleCalCron);
app.get("/api/cal/cron/:jobId", handleCalCronStatus);

/** Egor's phone button. Not on the assistant allowlist. */
app.use("/api/cal", requireAuth, calRoutes);

/** Household Bearer token, or X-Assistant-Key for the Telegram assistant (route allowlist). */
app.use("/api", requireAuthOrAssistant, apiRoutes);

app.listen(PORT, () => {
  console.log(`Finance API listening on http://127.0.0.1:${PORT}`);
});

// One failed async route (e.g. the analyzer unreachable) must not take the whole API down.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection (kept running):", reason);
});
