import { t, tr } from "@/shared/i18n";
/**
 * Turn a thrown error into a sentence a person can act on.
 * Network failures look different per browser ("Failed to fetch", "Load failed", "NetworkError…").
 */
export function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const text = raw.replace(/^(TypeError|Error):\s*/, "").trim();
  if (/failed to fetch|load failed|networkerror|network request failed|err_internet|offline/i.test(text)) {
    return t("Can't reach the server right now. Check your connection and try again.");
  }
  if (/timeout|timed out|aborted/i.test(text)) {
    return t("The server is taking too long to answer. Try again in a moment.");
  }
  return tr(text) || t("Something went wrong. Try again.");
}
