/**
 * Finance Drive auto-ingest — Google Apps Script
 *
 * Drop Leumi .xlsx into Finance/statements/partial or .../final.
 * This script wakes the Render API/analyzer and POSTs to /api/ingest,
 * then moves the file to imported/partial|final (or imported/failed).
 *
 * Setup: see README.md in this folder.
 *
 * Why a timer (not "on new file")?
 * Personal Apps Script has no reliable Drive "file created in folder" push
 * trigger for arbitrary folders. Polling every few minutes is the supported
 * approach. A script lock prevents overlapping runs from hammering Render.
 */

var PROP = {
  API_BASE: "API_BASE",
  INGEST_SECRET: "INGEST_SECRET",
  FOLDER_PARTIAL: "FOLDER_PARTIAL",
  FOLDER_FINAL: "FOLDER_FINAL",
  FOLDER_IMPORTED_PARTIAL: "FOLDER_IMPORTED_PARTIAL",
  FOLDER_IMPORTED_FINAL: "FOLDER_IMPORTED_FINAL",
  FOLDER_IMPORTED_FAILED: "FOLDER_IMPORTED_FAILED",
};

/**
 * Manual test from the script editor.
 * Waits for any stuck/trigger run to finish (up to ~3 min) instead of skipping.
 */
function runOnce() {
  processNewStatements_({ waitForLockMs: 180000, label: "runOnce" });
}

/** Timer entry point — skips immediately if another run holds the lock. */
function processNewStatements() {
  processNewStatements_({ waitForLockMs: 1000, label: "trigger" });
}

/** Install a 5-minute timer (Drive has no reliable folder create trigger). */
function installTriggers() {
  removeTriggers_();
  ScriptApp.newTrigger("processNewStatements").timeBased().everyMinutes(5).create();
  Logger.log("Installed 5-minute processNewStatements trigger");
}

function removeTriggers() {
  removeTriggers_();
  Logger.log("Removed all project triggers");
}

function removeTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
}

function processNewStatements_(opts) {
  opts = opts || {};
  var waitMs = opts.waitForLockMs != null ? opts.waitForLockMs : 1000;
  var label = opts.label || "run";

  var lock = LockService.getScriptLock();
  // Triggers skip fast; runOnce waits so you don't get a false "Skipped".
  if (!lock.tryLock(waitMs)) {
    Logger.log(
      "Skipped (" +
        label +
        "): another processNewStatements still holds the lock. " +
        "Run removeTriggers, wait until Executions show nothing Running, then try runOnce again."
    );
    return;
  }

  try {
    Logger.log("Lock acquired (" + label + ")");
    var cfg = loadConfig_();
    var partialFiles = listXlsx_(cfg.folderPartial);
    var finalFiles = listXlsx_(cfg.folderFinal);
    if (!partialFiles.length && !finalFiles.length) {
      Logger.log("No new .xlsx in partial/ or final/");
      return;
    }

    Logger.log(
      "Found " +
        partialFiles.length +
        " partial + " +
        finalFiles.length +
        " final .xlsx — waking API/analyzer…"
    );
    wakeApi_(cfg);
    processFiles_(partialFiles, "partial", cfg);
    processFiles_(finalFiles, "final", cfg);
  } finally {
    lock.releaseLock();
  }
}

function loadConfig_() {
  var props = PropertiesService.getScriptProperties();
  var required = [
    PROP.API_BASE,
    PROP.INGEST_SECRET,
    PROP.FOLDER_PARTIAL,
    PROP.FOLDER_FINAL,
    PROP.FOLDER_IMPORTED_PARTIAL,
    PROP.FOLDER_IMPORTED_FINAL,
    PROP.FOLDER_IMPORTED_FAILED,
  ];
  var missing = [];
  for (var i = 0; i < required.length; i++) {
    if (!props.getProperty(required[i])) missing.push(required[i]);
  }
  if (missing.length) {
    throw new Error("Missing script properties: " + missing.join(", "));
  }
  return {
    apiBase: String(props.getProperty(PROP.API_BASE)).replace(/\/$/, ""),
    ingestSecret: props.getProperty(PROP.INGEST_SECRET),
    folderPartial: DriveApp.getFolderById(props.getProperty(PROP.FOLDER_PARTIAL)),
    folderFinal: DriveApp.getFolderById(props.getProperty(PROP.FOLDER_FINAL)),
    importedPartial: DriveApp.getFolderById(props.getProperty(PROP.FOLDER_IMPORTED_PARTIAL)),
    importedFinal: DriveApp.getFolderById(props.getProperty(PROP.FOLDER_IMPORTED_FINAL)),
    importedFailed: DriveApp.getFolderById(props.getProperty(PROP.FOLDER_IMPORTED_FAILED)),
  };
}

function listXlsx_(folder) {
  var out = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName() || "";
    if (!/\.xlsx$/i.test(name)) continue;
    if (file.getMimeType() && file.getMimeType().indexOf("application/vnd.google-apps") === 0) {
      continue;
    }
    out.push(file);
  }
  return out;
}

function processFiles_(files, statementType, cfg) {
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var name = file.getName() || "";
    try {
      var result = uploadToApi_(file, statementType, cfg);
      Logger.log("Ingested " + name + " (" + statementType + "): " + JSON.stringify(result));
      moveFile_(file, statementType === "partial" ? cfg.importedPartial : cfg.importedFinal);
    } catch (err) {
      var msg = String(err);
      Logger.log("FAILED " + name + ": " + msg);
      // Transient: leave in inbox for the next tick (cold start / timeout).
      if (isTransientError_(msg)) {
        Logger.log("Leaving " + name + " in inbox (transient); will retry later");
        continue;
      }
      try {
        moveFile_(file, cfg.importedFailed);
      } catch (moveErr) {
        Logger.log("Could not move failed file " + name + ": " + moveErr);
      }
    }
  }
}

function isTransientError_(msg) {
  return (
    /Timed out waking/i.test(msg) ||
    /Timed out uploading/i.test(msg) ||
    /Analyzer not ready/i.test(msg) ||
    /wake HTTP 503/i.test(msg) ||
    /HTTP 503/i.test(msg) ||
    /HTTP 429/i.test(msg) ||
    /Exception: Service invoked too many times/i.test(msg) ||
    /Address unavailable/i.test(msg) ||
    /DNS error/i.test(msg)
  );
}

function wakeApi_(cfg) {
  var wakeUrl = cfg.apiBase + "/api/ingest/wake";
  // Shallow /health only — wakes the API. Do NOT use ?deep=1 here (that blocks on analyzer).
  var healthUrl = cfg.apiBase + "/health";
  // Free Render: API + analyzer can both sleep; poll for up to ~6 min.
  var started = Date.now();
  var deadline = started + 360000;
  var attempt = 0;
  var lastError = "wake failed";

  Logger.log("Wake start (up to ~6 min): " + cfg.apiBase);

  while (Date.now() < deadline) {
    attempt += 1;
    var elapsedSec = Math.round((Date.now() - started) / 1000);
    var leftSec = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    try {
      // Touch public health first (wakes the API container on free Render)
      UrlFetchApp.fetch(healthUrl, { muteHttpExceptions: true, followRedirects: true });

      var res = UrlFetchApp.fetch(wakeUrl, {
        method: "get",
        headers: { "X-Ingest-Key": cfg.ingestSecret },
        muteHttpExceptions: true,
        followRedirects: true,
      });
      var code = res.getResponseCode();
      var text = res.getContentText() || "";
      var body = {};
      try {
        body = JSON.parse(text || "{}");
      } catch (e) {}
      if (code >= 200 && code < 300 && body.ready === true) {
        Logger.log("Wake OK after " + elapsedSec + "s (attempt " + attempt + ")");
        return;
      }
      lastError =
        "wake HTTP " +
        code +
        ": " +
        (body.error || text || "Analyzer not ready") +
        (body.analyzer_url ? " @ " + body.analyzer_url : "");
    } catch (e) {
      lastError = String(e);
    }
    Logger.log(
      "Wake attempt " +
        attempt +
        " @ " +
        elapsedSec +
        "s — not ready (" +
        lastError +
        "); " +
        leftSec +
        "s left"
    );
    Utilities.sleep(Math.min(4000 + attempt * 500, 12000));
  }
  throw new Error("Timed out waking API/analyzer: " + lastError);
}

function uploadToApi_(file, statementType, cfg) {
  var blob = file.getBlob();
  var filename = file.getName();
  if (!/\.xlsx$/i.test(filename)) filename += ".xlsx";

  var boundary = "financeingest" + Date.now();
  var crlf = "\r\n";
  var bodyStart =
    "--" +
    boundary +
    crlf +
    'Content-Disposition: form-data; name="statement_type"' +
    crlf +
    crlf +
    statementType +
    crlf +
    "--" +
    boundary +
    crlf +
    'Content-Disposition: form-data; name="auto_translate"' +
    crlf +
    crlf +
    "true" +
    crlf +
    "--" +
    boundary +
    crlf +
    'Content-Disposition: form-data; name="file"; filename="' +
    filename.replace(/"/g, "") +
    '"' +
    crlf +
    "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" +
    crlf +
    crlf;

  var bodyEnd = crlf + "--" + boundary + "--" + crlf;
  var payload = Utilities.newBlob(bodyStart)
    .getBytes()
    .concat(blob.getBytes())
    .concat(Utilities.newBlob(bodyEnd).getBytes());

  var deadline = Date.now() + 180000;
  var attempt = 0;
  var lastError = "upload failed";

  Logger.log("Upload start: " + filename + " (" + statementType + ")");

  while (Date.now() < deadline) {
    attempt += 1;
    Logger.log("Upload attempt " + attempt + " for " + filename);
    var res = UrlFetchApp.fetch(cfg.apiBase + "/api/ingest", {
      method: "post",
      contentType: "multipart/form-data; boundary=" + boundary,
      headers: { "X-Ingest-Key": cfg.ingestSecret },
      payload: payload,
      muteHttpExceptions: true,
      followRedirects: true,
    });
    var code = res.getResponseCode();
    var text = res.getContentText() || "";
    if (code >= 200 && code < 300) {
      Logger.log("Upload OK: " + filename + " (HTTP " + code + ")");
      try {
        return JSON.parse(text);
      } catch (e) {
        return { ok: true, raw: text };
      }
    }
    if (code === 503 || code === 429) {
      lastError = "HTTP " + code + ": " + text;
      Logger.log("Upload soft-fail " + lastError + " — rewake then retry");
      Utilities.sleep(Math.min(5000 + attempt * 2000, 20000));
      try {
        wakeApi_(cfg);
      } catch (wakeErr) {
        lastError = String(wakeErr);
      }
      continue;
    }
    throw new Error("HTTP " + code + ": " + text);
  }
  throw new Error("Timed out uploading after wake retries: " + lastError);
}

function moveFile_(file, destFolder) {
  var parents = file.getParents();
  while (parents.hasNext()) {
    parents.next().removeFile(file);
  }
  destFolder.addFile(file);
}
