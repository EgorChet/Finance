import type { Cookie } from "puppeteer";
import type { CalSessionData } from "../storage/calSession.js";

/** Cal idle sessions typically die within a few hours — used as a soft age hint only. */
export const CAL_SESSION_SOFT_MAX_AGE_MS = 2.5 * 60 * 60 * 1000;

export type CalSessionFreshness = {
  usable: boolean;
  reason: string | null;
  savedAgeMs: number | null;
  tokenExpiresAt: number | null;
  earliestCookieExpiresAt: number | null;
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Extract absolute expiry (ms) from Cal auth-module sessionStorage JSON, if present. */
export function tokenExpiresAtFromAuthModule(authModuleRaw: string | null | undefined): number | null {
  if (!authModuleRaw?.trim()) return null;
  try {
    const parsed = JSON.parse(authModuleRaw) as {
      auth?: {
        calConnectToken?: string | null;
        tokenExp?: number | string | null;
        expiresAt?: number | string | null;
        exp?: number | string | null;
      };
    };
    const auth = parsed.auth;
    if (!auth) return null;

    for (const raw of [auth.tokenExp, auth.expiresAt, auth.exp]) {
      if (raw == null || raw === "") continue;
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || n <= 0) continue;
      // Seconds vs milliseconds.
      return n < 1e12 ? n * 1000 : n;
    }

    const jwt = auth.calConnectToken?.trim();
    if (!jwt) return null;
    const payload = decodeJwtPayload(jwt);
    const exp = payload?.exp;
    if (typeof exp === "number" && Number.isFinite(exp) && exp > 0) {
      return exp * 1000;
    }
    return null;
  } catch {
    return null;
  }
}

export function earliestCookieExpiresAt(cookies: Cookie[], nowMs = Date.now()): number | null {
  let earliest: number | null = null;
  for (const cookie of cookies) {
    const expires = cookie.expires;
    // Puppeteer: session cookies use -1 / 0 / omitted.
    if (expires == null || expires <= 0) continue;
    const ms = expires < 1e12 ? expires * 1000 : expires;
    // Ignore absurd far-future cookie expiries for "soonest useful auth cookie" checks;
    // short-lived auth cookies usually expire within a day.
    if (ms - nowMs > 48 * 60 * 60 * 1000) continue;
    if (earliest == null || ms < earliest) earliest = ms;
  }
  return earliest;
}

export function assessCalSessionFreshness(
  session: CalSessionData | null,
  nowMs = Date.now(),
): CalSessionFreshness {
  if (!session) {
    return {
      usable: false,
      reason: "No saved Cal session",
      savedAgeMs: null,
      tokenExpiresAt: null,
      earliestCookieExpiresAt: null,
    };
  }

  const savedAtMs = session.saved_at ? Date.parse(session.saved_at) : NaN;
  const savedAgeMs = Number.isFinite(savedAtMs) ? Math.max(0, nowMs - savedAtMs) : null;

  const authRaw =
    session.auth_module ??
    session.session_storage?.["auth-module"] ??
    null;
  const tokenExpiresAt = tokenExpiresAtFromAuthModule(authRaw);
  const cookieExpiresAt = earliestCookieExpiresAt(session.cookies, nowMs);

  if (tokenExpiresAt != null && tokenExpiresAt <= nowMs) {
    return {
      usable: false,
      reason: "Saved Cal login token has expired",
      savedAgeMs,
      tokenExpiresAt,
      earliestCookieExpiresAt: cookieExpiresAt,
    };
  }

  if (cookieExpiresAt != null && cookieExpiresAt <= nowMs) {
    return {
      usable: false,
      reason: "Saved Cal session cookies have expired",
      savedAgeMs,
      tokenExpiresAt,
      earliestCookieExpiresAt: cookieExpiresAt,
    };
  }

  // Soft age hint when we have no explicit expiry signals.
  if (
    tokenExpiresAt == null &&
    cookieExpiresAt == null &&
    savedAgeMs != null &&
    savedAgeMs > CAL_SESSION_SOFT_MAX_AGE_MS
  ) {
    return {
      usable: false,
      reason: "Saved Cal session is older than a few hours and likely expired",
      savedAgeMs,
      tokenExpiresAt,
      earliestCookieExpiresAt: cookieExpiresAt,
    };
  }

  return {
    usable: true,
    reason: null,
    savedAgeMs,
    tokenExpiresAt,
    earliestCookieExpiresAt: cookieExpiresAt,
  };
}
