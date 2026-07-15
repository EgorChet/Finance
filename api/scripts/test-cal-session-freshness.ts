/**
 * Lightweight checks for calSessionFreshness (run: npx tsx api/scripts/test-cal-session-freshness.ts)
 */
import assert from "node:assert/strict";
import {
  assessCalSessionFreshness,
  earliestCookieExpiresAt,
  tokenExpiresAtFromAuthModule,
  CAL_SESSION_SOFT_MAX_AGE_MS,
} from "../src/services/calSessionFreshness.js";
import type { CalSessionData } from "../src/storage/calSession.js";

function b64url(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function fakeJwt(expSeconds: number): string {
  return `${b64url({ alg: "none" })}.${b64url({ exp: expSeconds })}.sig`;
}

function baseSession(overrides: Partial<CalSessionData> = {}): CalSessionData {
  return {
    cookies: [{ name: "x", value: "y", domain: ".cal-online.co.il", path: "/" } as CalSessionData["cookies"][number]],
    auth_module: null,
    saved_at: new Date().toISOString(),
    ...overrides,
  };
}

const now = Date.now();

{
  const exp = Math.floor(now / 1000) + 3600;
  const ms = tokenExpiresAtFromAuthModule(
    JSON.stringify({ auth: { calConnectToken: fakeJwt(exp) } }),
  );
  assert.equal(ms, exp * 1000);
}

{
  const exp = Math.floor(now / 1000) - 60;
  const fresh = assessCalSessionFreshness(
    baseSession({
      auth_module: JSON.stringify({ auth: { calConnectToken: fakeJwt(exp) } }),
    }),
    now,
  );
  assert.equal(fresh.usable, false);
  assert.match(fresh.reason || "", /expired/i);
}

{
  const cookieExpSec = Math.floor(now / 1000) - 10;
  const cookies = [
    {
      name: "auth",
      value: "1",
      domain: "digital-web.cal-online.co.il",
      path: "/",
      expires: cookieExpSec,
    },
  ] as CalSessionData["cookies"];
  assert.equal(earliestCookieExpiresAt(cookies, now), cookieExpSec * 1000);
  const fresh = assessCalSessionFreshness(baseSession({ cookies, auth_module: null }), now);
  assert.equal(fresh.usable, false);
  assert.match(fresh.reason || "", /cookies have expired/i);
}

{
  const fresh = assessCalSessionFreshness(
    baseSession({
      saved_at: new Date(now - CAL_SESSION_SOFT_MAX_AGE_MS - 60_000).toISOString(),
      auth_module: null,
      cookies: [
        {
          name: "session",
          value: "1",
          domain: ".cal-online.co.il",
          path: "/",
          expires: -1,
        } as CalSessionData["cookies"][number],
      ],
    }),
    now,
  );
  assert.equal(fresh.usable, false);
  assert.match(fresh.reason || "", /few hours/i);
}

{
  const fresh = assessCalSessionFreshness(
    baseSession({
      saved_at: new Date(now - 30 * 60_000).toISOString(),
      auth_module: JSON.stringify({
        auth: { calConnectToken: fakeJwt(Math.floor(now / 1000) + 1800) },
      }),
    }),
    now,
  );
  assert.equal(fresh.usable, true);
  assert.equal(fresh.reason, null);
}

{
  const fresh = assessCalSessionFreshness(null, now);
  assert.equal(fresh.usable, false);
}

console.log("calSessionFreshness checks passed");
