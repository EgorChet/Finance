import path from "path";
import { analyzeFileBuffer, isAnalyzerConnectivityError } from "./analyzerClient.js";
import {
  finalizeStatementByKey,
  findStatementByHash,
  normalizeProvisionalChargesAsync,
  promoteStatementToFinal,
  rememberReport,
  removeStatementByKeyIfHash,
} from "./reportService.js";
import { getFinalizeVersion } from "./finalizeVersion.js";
import { fileHash, readRules, readStatements, saveUploadedXlsx, writeStatements } from "../storage/index.js";

export type StatementType = "partial" | "final";

export type StatementUploadResult =
  | { skipped: true; reason: "unchanged" }
  | {
      key: string;
      provisional: boolean;
      upgraded?: boolean;
      report: import("../types.js").SpendingReport;
    };

export function sanitizeUploadFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ]+/g, "").trim() || "upload.xlsx";
  return base.toLowerCase().endsWith(".xlsx") ? base : `${base}.xlsx`;
}

export function parseStatementType(raw: unknown): StatementType | null {
  const value = String(raw || "").toLowerCase().trim();
  if (value === "partial" || value === "final") return value;
  return null;
}

/** Analyze + store a Leumi .xlsx buffer. Shared by interactive upload and Drive ingest. */
export async function ingestStatementBuffer(
  buffer: Buffer,
  originalName: string,
  statementType: StatementType,
  autoTranslate = true,
): Promise<StatementUploadResult> {
  const provisional = statementType === "partial";
  const filename = sanitizeUploadFilename(originalName || "upload.xlsx");
  const hash = fileHash(buffer);
  const data = await readStatements();

  if (!provisional) {
    const existing = findStatementByHash(data, hash);
    if (existing && existing.entry.provisional !== true) {
      return { skipped: true, reason: "unchanged" };
    }
    if (existing && existing.entry.provisional === true) {
      promoteStatementToFinal(existing.entry);
      const rules = await readRules();
      const version = await getFinalizeVersion();
      await finalizeStatementByKey(data, existing.key, rules, version);
      await writeStatements(data);
      return {
        key: existing.key,
        provisional: false,
        upgraded: true,
        report: data.statements[existing.key]!.report,
      };
    }
  }

  const rules = await readRules();
  const report = await analyzeFileBuffer(buffer, filename, autoTranslate);
  const storedReport = provisional ? await normalizeProvisionalChargesAsync(report) : report;
  const savedPath = await saveUploadedXlsx(filename, buffer);
  const key = rememberReport(data, storedReport, savedPath, filename, hash, provisional);
  if (key !== "unknown") {
    removeStatementByKeyIfHash(data, "unknown", hash);
  }
  const version = await getFinalizeVersion();
  await finalizeStatementByKey(data, key, rules, version);
  await writeStatements(data);
  return { key, provisional, report: data.statements[key]!.report };
}

export function uploadErrorResponse(error: unknown): { status: number; error: string } {
  const message = error instanceof Error ? error.message : String(error);
  const waking = isAnalyzerConnectivityError(message);
  return {
    status: waking ? 503 : 500,
    error:
      waking && !message.startsWith("Analyzer error")
        ? "Analyzer is waking up (Render free tier). Wait ~30 seconds and try again."
        : message,
  };
}
