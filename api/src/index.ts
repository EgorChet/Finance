import cors from "cors";
import express from "express";
import { warmAnalyzer, normalizeAnalyzerUrl, analyzerUsesPublicUrl } from "./services/analyzerClient.js";
import { requireAuth } from "./auth.js";
import authRoutes from "./routes/auth.js";
import demoRoutes from "./routes/demo.js";
import apiRoutes from "./routes/index.js";
import { getIcsFeed, verifyFeedToken } from "./services/calendarService.js";

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
app.use(express.json({ limit: "50mb" }));

app.get("/health", async (req, res) => {
  const deep = req.query.deep === "1" || req.query.deep === "true";
  if (!deep) {
    res.json({ status: "ok" });
    return;
  }
  const analyzer = await warmAnalyzer();
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

app.get("/calendar/feed.ics", async (req, res) => {
  const token = req.query.token as string | undefined;
  if (!(await verifyFeedToken(token))) {
    res.status(401).send("Invalid or missing token");
    return;
  }
  try {
    const body = await getIcsFeed();
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.send(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Calendar feed unavailable";
    res.status(500).send(message);
  }
});

app.use("/api", requireAuth, apiRoutes);

app.listen(PORT, () => {
  console.log(`Finance API listening on http://127.0.0.1:${PORT}`);
});
