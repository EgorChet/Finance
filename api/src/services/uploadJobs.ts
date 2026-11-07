import { randomUUID } from "crypto";
import type { UploadJobPublic, UploadJobStatus } from "../types.js";
import { warmAnalyzer } from "./analyzerClient.js";
import {
  ingestStatementBuffer,
  sanitizeUploadFilename,
  type StatementType,
  type StatementUploadResult,
} from "./statementUpload.js";
import { readUploadJobs, writeUploadJobs } from "../storage/index.js";

export type { UploadJobPublic, UploadJobStatus };

type UploadJobRecord = UploadJobPublic & {
  /** Present only while this process owns the job. */
  buffer?: Buffer;
  auto_translate: boolean;
  result?: StatementUploadResult;
};

const jobs = new Map<string, UploadJobRecord>();

function nowIso(): string {
  return new Date().toISOString();
}

function publicView(job: UploadJobRecord): UploadJobPublic {
  return {
    jobId: job.jobId,
    status: job.status,
    message: job.message,
    filename: job.filename,
    statement_type: job.statement_type,
    created_at: job.created_at,
    updated_at: job.updated_at,
    result: job.result,
    error: job.error,
  };
}

async function persistJob(job: UploadJobRecord): Promise<void> {
  try {
    const data = await readUploadJobs();
    data.jobs[job.jobId] = publicView(job);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, entry] of Object.entries(data.jobs)) {
      const terminal = entry.status === "done" || entry.status === "error";
      if (terminal && Date.parse(entry.updated_at) < cutoff) delete data.jobs[id];
    }
    await writeUploadJobs(data);
  } catch (err) {
    console.error("Failed to persist upload job:", err);
  }
}

async function patchJob(
  jobId: string,
  patch: Partial<Pick<UploadJobRecord, "status" | "message" | "result" | "error">>,
): Promise<UploadJobRecord | undefined> {
  const job = jobs.get(jobId);
  if (!job) return undefined;
  Object.assign(job, patch, { updated_at: nowIso() });
  jobs.set(jobId, job);
  await persistJob(job);
  return job;
}

/** Brief warmup per poll — same pattern as Apps Script /api/ingest/wake. */
const WAKE_POLL_ATTEMPTS = Number(process.env.ANALYZER_WAKE_HTTP_ATTEMPTS || 3);
const WAKE_DEADLINE_MS = Number(process.env.UPLOAD_WAKE_DEADLINE_MS || 360_000);

async function wakeWithRetries(jobId: string): Promise<void> {
  await patchJob(jobId, { status: "waking", message: "Waking analyzer…" });
  const deadline = Date.now() + WAKE_DEADLINE_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    // Short budget each tick; outer loop covers free-tier cold starts (~6 min).
    const ready = await warmAnalyzer({ maxAttempts: WAKE_POLL_ATTEMPTS });
    if (ready) return;
    await patchJob(jobId, {
      status: "waking",
      message: `Waking analyzer (attempt ${attempt})…`,
    });
    await new Promise((r) => setTimeout(r, Math.min(4000 + attempt * 500, 12_000)));
  }
  throw new Error("Analyzer did not wake in time (Render free tier). Try again in a minute.");
}

async function runJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job?.buffer) {
    await patchJob(jobId, {
      status: "error",
      message: "Upload job lost (server restarted before processing finished).",
      error: "Upload job interrupted",
    });
    return;
  }

  try {
    await wakeWithRetries(jobId);
    await patchJob(jobId, { status: "analyzing", message: "Analysing statement…" });
    const result = await ingestStatementBuffer(
      job.buffer,
      job.filename,
      job.statement_type,
      job.auto_translate,
    );
    job.buffer = undefined;
    let message = "Statement saved";
    if ("skipped" in result && result.skipped) message = "Already uploaded — nothing changed";
    else if ("upgraded" in result && result.upgraded) message = "Cycle closed — statement saved";
    await patchJob(jobId, { status: "done", message, result, error: undefined });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`Upload job ${jobId} failed:`, message);
    job.buffer = undefined;
    await patchJob(jobId, {
      status: "error",
      message: "Upload failed",
      error: message,
    });
  }
}

export async function createUploadJob(input: {
  buffer: Buffer;
  filename: string;
  statementType: StatementType;
  autoTranslate?: boolean;
}): Promise<UploadJobPublic> {
  const created = nowIso();
  const job: UploadJobRecord = {
    jobId: randomUUID(),
    status: "queued",
    message: "Upload received — starting…",
    filename: sanitizeUploadFilename(input.filename),
    statement_type: input.statementType,
    created_at: created,
    updated_at: created,
    buffer: input.buffer,
    auto_translate: input.autoTranslate !== false,
  };
  jobs.set(job.jobId, job);
  await persistJob(job);
  void runJob(job.jobId);
  return publicView(job);
}

function markInterrupted(job: UploadJobPublic): UploadJobPublic {
  if (job.status === "done" || job.status === "error") return job;
  // Buffer lived only in this process — if it's gone, the job cannot finish.
  return {
    ...job,
    status: "error",
    message: "Upload job interrupted",
    error: "Server restarted before this upload finished. Please try again.",
    updated_at: nowIso(),
  };
}

export async function getUploadJob(jobId: string): Promise<UploadJobPublic | null> {
  const live = jobs.get(jobId);
  if (live) return publicView(live);

  const data = await readUploadJobs();
  const stored = data.jobs[jobId];
  if (!stored) return null;

  const view = markInterrupted(stored);
  if (view.status === "error" && stored.status !== "error") {
    data.jobs[jobId] = view;
    await writeUploadJobs(data);
  }
  return view;
}
