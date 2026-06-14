const WAKE_ATTEMPTS = 30;
const WAKE_DELAY_MS = 5000;

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, "");
}

/**
 * Wake Render analyzer from the user's browser.
 * Server-to-server pings from finance-api often do not spin up a sleeping free-tier service;
 * external traffic (like opening the URL manually) does.
 */
export async function wakeAnalyzerInBrowser(publicUrl: string): Promise<void> {
  const base = normalizeUrl(publicUrl);
  let lastError = "";

  for (let attempt = 0; attempt < WAKE_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }

    try {
      const root = await fetch(`${base}/`);
      if (root.ok || root.status === 404) {
        const health = await fetch(`${base}/health`);
        if (health.ok) return;
        lastError = `HTTP ${health.status}`;
      } else {
        lastError = `HTTP ${root.status}`;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }

    if (attempt < WAKE_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, WAKE_DELAY_MS));
    }
  }

  throw new Error(
    `Analyzer did not wake in time (${lastError}). Open ${base} in a new tab, wait until it responds, then try again.`,
  );
}
