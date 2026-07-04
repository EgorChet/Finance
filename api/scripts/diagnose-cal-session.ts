/**
 * Diagnose Cal session restore on the same stack as production (Chromium + Supabase).
 *
 * Phase 1 — auth sync: clear saved session, SMS login, full export, save session.
 * Phase 2 — auto sync: new browser, restore session only (should skip SMS).
 *
 * Usage (from repo root, with prod or local env):
 *   CAL_SYNC_ENABLED=1 npx tsx api/scripts/diagnose-cal-session.ts
 *
 * OTP:
 *   - Interactive prompt when SMS is sent, or
 *   - CAL_OTP=123456 for non-interactive (only if you already have the code)
 *
 * Options:
 *   --restore-only   Skip phase 1; only try restore with the session already in storage.
 */
import { createInterface } from "readline";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(repoRoot, "api", ".env"));

const {
  createCalSyncJob,
  getCalJobStatus,
  releaseCalJob,
  submitCalOtpCode,
} = await import("../src/services/calSyncService.js");
const { calSyncEnabled, readCalCredentials } = await import("../src/storage/calCredentials.js");
const { clearCalSession, readCalSession } = await import("../src/storage/calSession.js");

type PhaseResult = {
  name: string;
  ok: boolean;
  status: string;
  error: string | null;
  logs: { at: string; message: string }[];
  usedSms: boolean;
  restoreOk: boolean | null;
};

function banner(title: string): void {
  console.log("\n" + "=".repeat(72));
  console.log(title);
  console.log("=".repeat(72));
}

function logLine(prefix: string, message: string): void {
  console.log(`[${prefix}] ${message}`);
}

async function promptOtp(): Promise<string> {
  const fromEnv = process.env.CAL_OTP?.replace(/\D/g, "") ?? "";
  if (fromEnv.length >= 4) {
    logLine("otp", "Using CAL_OTP from environment");
    return fromEnv;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise<string>((resolve) => {
    rl.question("Enter SMS code from Cal: ", (answer) => resolve(answer));
  });
  rl.close();
  const digits = code.replace(/\D/g, "");
  if (digits.length < 4) throw new Error("Invalid SMS code");
  return digits;
}

function analyzeLogs(logs: { message: string }[]): {
  usedSms: boolean;
  restoreOk: boolean | null;
} {
  const text = logs.map((l) => l.message).join("\n");
  const usedSms =
    /SMS sent|Entering teudat|OTP submitted|signing in with SMS/i.test(text) ||
    /Saved session cleared/i.test(text);
  let restoreOk: boolean | null = null;
  if (/Saved session is still valid/i.test(text)) restoreOk = true;
  if (/could not restore dashboard|Saved session expired|Saved session cleared/i.test(text)) {
    restoreOk = false;
  }
  return { usedSms, restoreOk };
}

function printLogs(logs: { at: string; message: string }[]): void {
  if (!logs.length) {
    console.log("(no job logs)");
    return;
  }
  for (const entry of logs) {
    console.log(`  ${entry.at}  ${entry.message}`);
  }
}

async function summarizeStoredSession(): Promise<void> {
  const session = await readCalSession();
  if (!session) {
    logLine("session", "No saved Cal session in storage");
    return;
  }
  const sessionKeys = Object.keys(session.session_storage ?? {});
  const localKeys = Object.keys(session.local_storage ?? {});
  const hasAuthModule = Boolean(session.auth_module || session.session_storage?.["auth-module"]);
  logLine(
    "session",
    [
      `saved_at=${session.saved_at}`,
      `cookies=${session.cookies.length}`,
      `auth_module=${hasAuthModule}`,
      `session_storage_keys=${sessionKeys.length}${sessionKeys.length ? ` [${sessionKeys.join(", ")}]` : ""}`,
      `local_storage_keys=${localKeys.length}${localKeys.length ? ` [${localKeys.join(", ")}]` : ""}`,
    ].join(" | "),
  );
}

async function runPhase(
  name: string,
  opts: { expectRestore: boolean; mode: "auto" | "classic" },
): Promise<PhaseResult> {
  banner(`PHASE: ${name}`);
  const creds = await readCalCredentials();
  if (!creds) throw new Error("Cal credentials not configured (save them via Sync Cal in the app first)");

  logLine("phase", `Starting job (mode=${opts.mode}, expectRestore=${opts.expectRestore})…`);
  const job = await createCalSyncJob(creds, opts.mode);
  logLine("phase", `jobId=${job.id}`);

  let otpSubmitted = false;
  const started = Date.now();
  const timeoutMs = 8 * 60_000;

  while (Date.now() - started < timeoutMs) {
    const status = getCalJobStatus(job.id);
    if (!status) throw new Error("Job disappeared from memory");

    if (status.status === "otp_required" && !otpSubmitted) {
      logLine("phase", "SMS OTP required");
      if (opts.expectRestore) {
        logLine("phase", "UNEXPECTED: restore path asked for SMS — session restore failed");
      }
      const code = await promptOtp();
      submitCalOtpCode(job.id, code);
      otpSubmitted = true;
    }

    if (status.status === "done" || status.status === "error" || status.status === "cancelled") {
      const { usedSms, restoreOk } = analyzeLogs(status.logs);
      banner(`LOGS — ${name}`);
      printLogs(status.logs);
      logLine("phase", `status=${status.status} error=${status.error ?? "none"}`);
      logLine("phase", `usedSms=${usedSms} restoreOk=${restoreOk}`);
      await summarizeStoredSession();

      const ok =
        status.status === "done" &&
        (!opts.expectRestore || (restoreOk === true && !usedSms));

      releaseCalJob(job.id);
      return {
        name,
        ok,
        status: status.status,
        error: status.error,
        logs: status.logs,
        usedSms,
        restoreOk,
      };
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  const status = getCalJobStatus(job.id);
  releaseCalJob(job.id);
  throw new Error(`Phase timed out (${name}): last status=${status?.status ?? "missing"}`);
}

function printVerdict(auth: PhaseResult | null, restore: PhaseResult): void {
  banner("VERDICT");
  if (auth) {
    console.log(`Auth sync:    ${auth.ok ? "PASS" : "FAIL"} (status=${auth.status})`);
    if (auth.error) console.log(`  error: ${auth.error}`);
  } else {
    console.log("Auth sync:    skipped (--restore-only)");
  }

  console.log(`Auto/restore: ${restore.ok ? "PASS" : "FAIL"} (status=${restore.status})`);
  if (restore.error) console.log(`  error: ${restore.error}`);
  if (restore.restoreOk === true) console.log("  restore: dashboard came up from saved session");
  if (restore.restoreOk === false) console.log("  restore: saved session did not restore dashboard");
  if (restore.usedSms && restore.restoreOk !== true) {
    console.log("  note: fell back to SMS — this is the restore bug path");
  }
  if (restore.status === "done" && restore.usedSms && restore.restoreOk === false) {
    console.log("  note: sync completed only because SMS login ran after restore failed");
  }

  if (!restore.ok) {
    console.log("\nLook at the AUTO SYNC logs above for the last diagnostic line:");
    console.log('  "Saved session could not restore dashboard (url=… token=… dashboard=…)"');
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const restoreOnly = process.argv.includes("--restore-only");

  banner("Cal session diagnostic");
  logLine("env", `CAL_SYNC_ENABLED=${process.env.CAL_SYNC_ENABLED ?? ""}`);
  logLine("env", `SUPABASE_URL=${process.env.SUPABASE_URL ? "set" : "missing"}`);
  logLine(
    "env",
    `CAL_SESSION_ENCRYPTION_KEY=${process.env.CAL_SESSION_ENCRYPTION_KEY ? "set" : "missing"}`,
  );
  logLine("env", `PUPPETEER_EXECUTABLE_PATH=${process.env.PUPPETEER_EXECUTABLE_PATH ?? "(bundled)"}`);

  if (!calSyncEnabled()) {
    throw new Error("Set CAL_SYNC_ENABLED=true (or 1)");
  }

  const creds = await readCalCredentials();
  if (!creds) {
    throw new Error("No Cal credentials in storage — configure Sync Cal in the app first");
  }
  logLine("env", `credentials ok (card ••••${creds.card_last4})`);
  await summarizeStoredSession();

  let authResult: PhaseResult | null = null;

  if (!restoreOnly) {
    logLine("setup", "Clearing saved session so phase 1 must use SMS…");
    await clearCalSession();
    authResult = await runPhase("AUTH SYNC (SMS login)", { expectRestore: false, mode: "classic" });
    if (!authResult.ok) {
      banner("VERDICT");
      console.log("Auth sync failed — fix SMS/login before testing restore.");
      if (authResult.error) console.log(`  error: ${authResult.error}`);
      process.exitCode = 1;
      return;
    }
    logLine("setup", "Auth sync OK — session should now be saved. Starting restore phase…");
    await summarizeStoredSession();
  } else {
    const session = await readCalSession();
    if (!session) {
      throw new Error("--restore-only requires an existing saved session");
    }
  }

  const restoreResult = await runPhase("AUTO SYNC (session restore)", {
    expectRestore: true,
    mode: "auto",
  });
  printVerdict(authResult, restoreResult);
}

main().catch((err) => {
  console.error("\nDiagnostic failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
