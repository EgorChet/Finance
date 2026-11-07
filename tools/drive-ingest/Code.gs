/**
 * Finance Drive auto-ingest — Google Apps Script
 *
 * Drop Leumi .xlsx into Finance/statements/partial or .../final.
 * This script wakes the Render API/analyzer and POSTs to /api/ingest,
 * then moves the file to imported/partial|final (or imported/failed).
 *
 * Setup: see README.md in this folder.
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

/** Manual test from the script editor. */
function runOnce() {
  processNewStatements();
}

/** Install a 1-minute timer (Drive has no reliable folder create trigger). */
function installTriggers() {
  removeTriggers_();
  ScriptApp.newTrigger("processNewStatements").timeBased().everyMinutes(1).create();
  Logger.log("Installed 1-minute processNewStatements trigger");
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

function processNewStatements() {
  var cfg = loadConfig_();
  processFolder_(cfg.folderPartial, "partial", cfg);
  processFolder_(cfg.folderFinal, "final", cfg);
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

function processFolder_(folder, statementType, cfg) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName() || "";
    if (!/\.xlsx$/i.test(name)) continue;
    // Skip Google Docs / shortcuts
    if (file.getMimeType() && file.getMimeType().indexOf("application/vnd.google-apps") === 0) {
      continue;
    }
    try {
      wakeApi_(cfg);
      var result = uploadToApi_(file, statementType, cfg);
      Logger.log("Ingested " + name + " (" + statementType + "): " + JSON.stringify(result));
      moveFile_(file, statementType === "partial" ? cfg.importedPartial : cfg.importedFinal);
    } catch (err) {
      Logger.log("FAILED " + name + ": " + err);
      try {
        moveFile_(file, cfg.importedFailed);
      } catch (moveErr) {
        Logger.log("Could not move failed file " + name + ": " + moveErr);
      }
    }
  }
}

function wakeApi_(cfg) {
  var wakeUrl = cfg.apiBase + "/api/ingest/wake";
  var healthUrl = cfg.apiBase + "/health?deep=1";
  var deadline = Date.now() + 120000;
  var attempt = 0;
  var lastError = "wake failed";

  while (Date.now() < deadline) {
    attempt += 1;
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
      if (code >= 200 && code < 300) {
        var body = {};
        try {
          body = JSON.parse(res.getContentText() || "{}");
        } catch (e) {}
        if (body.ready === true) return;
        lastError = "Analyzer not ready yet";
      } else {
        lastError = "wake HTTP " + code + ": " + res.getContentText();
      }
    } catch (e) {
      lastError = String(e);
    }
    Utilities.sleep(Math.min(5000 + attempt * 1000, 15000));
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

  while (Date.now() < deadline) {
    attempt += 1;
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
      try {
        return JSON.parse(text);
      } catch (e) {
        return { ok: true, raw: text };
      }
    }
    if (code === 503) {
      lastError = "HTTP 503: " + text;
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
