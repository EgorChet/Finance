import { createHash } from "crypto";
import {
  finalizeStatementByKey,
  normalizeProvisionalChargesAsync,
  rememberReport,
} from "./reportService.js";
import { getFinalizeVersion } from "./finalizeVersion.js";
import { analyzeFileBuffer } from "./analyzerClient.js";
import { readRules, readStatements, writeStatements } from "../storage/index.js";
import { openCycleBillingDate } from "../utils/billingCycle.js";

export async function persistCalSyncExport(buffer: Buffer, filename: string) {
  const billingDate = openCycleBillingDate();
  const report = await analyzeFileBuffer(buffer, filename, true);
  const storedReport = await normalizeProvisionalChargesAsync(report);
  const hash = createHash("sha256").update(buffer).digest("hex");

  const data = await readStatements();
  const rules = await readRules();
  const key = rememberReport(
    data,
    storedReport,
    `cal-sync:${billingDate}`,
    filename,
    hash,
    true,
  );
  const version = await getFinalizeVersion();
  await finalizeStatementByKey(data, key, rules, version);
  await writeStatements(data);
  return { key, report: data.statements[key]!.report };
}
