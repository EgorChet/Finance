import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { fetchYearOpen, priceChangePct } from "../src/services/kaspaPrice.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const jan1 = Date.UTC(2026, 0, 1);

function mockKlines(rows: unknown, ok = true) {
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(String(url));
    return { ok, json: async () => rows } as Response;
  }) as typeof fetch;
  return urls;
}

describe("Kaspa change since 1 January", () => {
  it("percent change is rounded to one decimal, negative when the price fell", () => {
    assert.equal(priceChangePct(0.04, 0.05), 25);
    assert.equal(priceChangePct(0.042974, 0.025632), -40.4);
    assert.equal(priceChangePct(0.1, 0.1), 0);
  });

  it("takes the open of the 1 January candle and asks with both start and end time", async () => {
    const urls = mockKlines([[jan1, "0.042974", "0.04499", "0.042423", "0.044721"]]);
    assert.equal(await fetchYearOpen(2026), 0.042974);
    assert.match(urls[0]!, new RegExp(`startTime=${jan1}&endTime=${jan1 + 86_400_000}`));
  });

  it("never guesses: another day's candle, an empty answer or an HTTP error give no price", async () => {
    mockKlines([[jan1 + 86_400_000 * 300, "0.025", "0.03", "0.02", "0.026"]]);
    assert.equal(await fetchYearOpen(2026), null);
    mockKlines([]);
    assert.equal(await fetchYearOpen(2026), null);
    mockKlines([[jan1, "0.04"]], false);
    assert.equal(await fetchYearOpen(2026), null);
  });
});

describe("All-time change against the amount invested", () => {
  it("only a positive finite number counts as an amount", async () => {
    const { positiveAmount } = await import("../src/services/investment.js");
    assert.equal(positiveAmount(1000), 1000);
    for (const bad of [0, -5, NaN, Infinity, "1000", null, undefined]) {
      assert.equal(positiveAmount(bad), null, String(bad));
    }
  });

  it("is the value against the amount put in, undefined when the amount is not known", async () => {
    const { allTimePct } = await import("../src/services/investment.js");
    assert.equal(allTimePct(1500, 1000), 50);
    assert.equal(allTimePct(600, 1000), -40);
    assert.equal(allTimePct(1000, null), undefined);
  });

  it("others than the owner never get a percentage, and a missing store never fails the quote", async () => {
    const { withAllTime } = await import("../src/services/investment.js");
    const quote = { price: 1 };
    assert.equal(await withAllTime(false, quote, 1500, "kaspa_usd"), quote);
  });
});
