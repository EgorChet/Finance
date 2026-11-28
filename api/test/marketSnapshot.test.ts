import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getMarketSnapshot } from "../src/services/marketSnapshot.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(handler: (url: string) => unknown | null) {
  globalThis.fetch = (async (input: unknown) => {
    const body = handler(String(input));
    if (body === null) return new Response("", { status: 500 });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

test("snapshot carries BTC, KAS, S&P 500 and DOG with their day change", async () => {
  mockFetch((url) => {
    if (url.includes("symbol=BTCUSDT")) return { lastPrice: "100000", openPrice: "98000" };
    if (url.includes("symbol=KASUSDT")) return { lastPrice: "0.05", openPrice: "0.0505" };
    if (url.includes("%5EGSPC")) return { chart: { result: [{ meta: { regularMarketPrice: 6100, chartPreviousClose: 6000 } }] } };
    if (url.includes("/DOG?")) return { chart: { result: [{ meta: { regularMarketPrice: 21, chartPreviousClose: 21.5 } }] } };
    if (url.includes("frankfurter")) return [{ quote: "ILS", rate: 3.6 }, { quote: "RUB", rate: 90 }];
    return null;
  });
  const s = await getMarketSnapshot({ force: true });
  assert.equal(s.btc_usd, 100000);
  assert.equal(s.kas_usd, 0.05);
  assert.equal(s.sp500, 6100);
  assert.equal(s.dog_usd, 21);
  assert.ok(Math.abs((s.change_pct?.btc ?? 0) - 2.0408) < 0.01);
  assert.ok((s.change_pct?.kas ?? 0) < 0);
  assert.ok(Math.abs((s.change_pct?.sp500 ?? 0) - 1.6667) < 0.01);
  assert.ok(Math.abs((s.change_pct?.dog ?? 0) - -2.3256) < 0.01);
  assert.equal(s.stale, undefined);
});

test("one failing source keeps the last known value and marks the snapshot partial", async () => {
  mockFetch((url) => {
    if (url.includes("symbol=BTCUSDT")) return { lastPrice: "101000", openPrice: "100000" };
    if (url.includes("symbol=KASUSDT")) return { lastPrice: "0.06", openPrice: "0.06" };
    if (url.includes("%5EGSPC")) return { chart: { result: [{ meta: { regularMarketPrice: 6110, chartPreviousClose: 6100 } }] } };
    if (url.includes("frankfurter")) return [{ quote: "ILS", rate: 3.6 }, { quote: "RUB", rate: 90 }];
    return null; // DOG fails
  });
  const s = await getMarketSnapshot({ force: true });
  assert.equal(s.dog_usd, 21);
  assert.equal(s.btc_usd, 101000);
  assert.equal(s.stale, true);
});
