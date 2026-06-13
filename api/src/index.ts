import cors from "cors";
import express from "express";
import { warmAnalyzer, normalizeAnalyzerUrl } from "./services/analyzerClient.js";
import { requireAuth } from "./auth.js";
import authRoutes from "./routes/auth.js";
import demoRoutes from "./routes/demo.js";
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
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/demo", demoRoutes);
app.use("/api", requireAuth, apiRoutes);

app.listen(PORT, () => {
  console.log(`Finance API listening on http://127.0.0.1:${PORT}`);
});
