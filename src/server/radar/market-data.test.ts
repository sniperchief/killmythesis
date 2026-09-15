import { describe, expect, it } from "vitest";
import { buildRadarSnapshot } from "@/lib/radar/engine";
import { NARRATIVES, universeSymbols, type NarrativeDefinition } from "@/lib/radar/taxonomy";
import { NOW, series, toCandles } from "@/lib/radar/test-helpers";
import type { RadarSnapshot } from "@/lib/radar/types";
import { createBitgetRest, type BitgetRest } from "@/server/connectors/bitget-rest";
import { failure, success } from "@/server/connectors/types";
import { fakeRest } from "@/server/research/test-fixtures";
import { collectMarketUniverse } from "./market-data";
import { createSnapshotCache } from "./snapshot";

const FAST = { spacingMs: 0, concurrency: 4, budgetMs: 2_000 };
const restWith = (overrides: Partial<BitgetRest>): BitgetRest => ({ ...fakeRest(), ...overrides });
const good = (pair: string, r7 = 8) => success(`Bitget spot candles ${pair} 1day`, toCandles(series({ r7, prior7: r7, r30: r7 })));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("radar data collection", () => {
  it("requests each unique symbol exactly once, including the benchmark", async () => {
    const pairs: string[] = [];
    const rest = restWith({
      spotCandles: async (pair) => {
        pairs.push(pair);
        return good(pair);
      },
    });
    await collectMarketUniverse(rest, { limits: FAST });
    const symbols = universeSymbols();
    const configured = NARRATIVES.reduce((sum, n) => sum + n.assets.length, 0);
    expect(symbols).toContain("BTC");
    expect(pairs).toHaveLength(symbols.length);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(pairs.length).toBeLessThanOrEqual(configured + 1);
  });

  it("records missing, unavailable and timed-out assets without filling them in", async () => {
    const started = Date.now();
    const rest = restWith({
      spotCandles: (pair) => {
        if (pair === "NOPEUSDT") return Promise.resolve(failure("Bitget", "not_listed", "Bitget 40034: symbol does not exist"));
        if (pair === "DOWNUSDT") return Promise.resolve(failure("Bitget", "http", "HTTP 503"));
        if (pair === "SLOWUSDT") return new Promise(() => {}); // never answers
        return Promise.resolve(good(pair));
      },
    });
    const universe = await collectMarketUniverse(rest, { symbols: ["BTC", "GOOD", "NOPE", "DOWN", "SLOW"], limits: { ...FAST, budgetMs: 100 } });
    expect(Date.now() - started).toBeLessThan(1_500);
    expect(universe.candles.GOOD.ok).toBe(true);
    expect(universe.candles.NOPE).toEqual({ ok: false, reason: "not listed" });
    expect(universe.candles.DOWN).toEqual({ ok: false, reason: "source error" });
    expect(universe.candles.SLOW).toEqual({ ok: false, reason: "timeout" });
  });

  it("reports a malformed Bitget response as unrecognized and keeps valid bulk rows", async () => {
    const candleRow = (ts: number) => [String(ts), "1", "1", "1", "2", "10", "20", "20"];
    const rest = createBitgetRest(async (url) => {
      if (url.includes("symbol=BADUSDT")) return json({ code: "00000", data: [["1789401600000", "not-a-number"]] });
      if (url.includes("/spot/market/candles")) return json({ code: "00000", data: [candleRow(1789315200000), candleRow(1789401600000)] });
      if (url.includes("/mix/market/tickers")) {
        return json({
          code: "00000",
          data: [
            { symbol: "GOODUSDT", markPrice: "2", fundingRate: "0.0001", holdingAmount: "500", ts: "1789401600000" },
            { symbol: "BROKENUSDT", markPrice: "", fundingRate: "", holdingAmount: "", ts: "" },
          ],
        });
      }
      if (url.includes("current-fund-rate")) {
        return json({ code: "00000", data: [{ symbol: "GOODUSDT", fundingRate: "0.0001", fundingRateInterval: "4" }, { symbol: "X" }] });
      }
      return json({ code: "40034", msg: "unknown", data: null }, 400);
    }, 1_000);

    const universe = await collectMarketUniverse(rest, { symbols: ["GOOD", "BAD"], limits: FAST });
    expect(universe.candles.GOOD.ok).toBe(true);
    expect(universe.candles.BAD).toEqual({ ok: false, reason: "unrecognized response" });
    // Funding is normalized to 8h: 0.01% every 4h → 0.02% per 8h. Open interest = contracts × mark price.
    expect(universe.positioning?.GOOD).toEqual({ funding8h: 0.0002, openInterestUsd: 1000 });
    expect(universe.positioning?.BAD).toBeUndefined();
    expect(universe.positioningNote).toBeNull();
  });

  it("marks positioning unavailable when the futures endpoints fail", async () => {
    const rest = restWith({
      spotCandles: async (pair) => good(pair),
      futuresTickers: async () => failure("Bitget futures tickers", "timeout", "timed out"),
      currentFundingRates: async () => failure("Bitget current funding rates", "timeout", "timed out"),
    });
    const universe = await collectMarketUniverse(rest, { symbols: ["BTC", "SOL"], limits: FAST });
    expect(universe.positioning).toBeNull();
    expect(universe.positioningNote).toBe("Positioning unavailable (timeout).");
  });

  it("keeps classifying with partial coverage and refuses when coverage is too low", async () => {
    const assets = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"];
    const narrative: NarrativeDefinition = { id: "test", name: "Test", description: "test", assets };
    const run = async (failing: Set<string>) => {
      const rest = restWith({
        spotCandles: async (pair) => (failing.has(pair.replace("USDT", "")) ? failure("Bitget", "timeout", "timed out") : good(pair)),
      });
      const universe = await collectMarketUniverse(rest, { symbols: ["BTC", ...assets], limits: FAST });
      return buildRadarSnapshot(universe, { mode: "live", now: NOW, narratives: [narrative] }).narratives[0];
    };

    const partial = await run(new Set(["A7", "A8"]));
    expect(partial.coverage).toMatchObject({ available: 6, configured: 8, level: "normal" });
    expect(partial.lifecycle).not.toBeNull();
    expect(partial.unavailable).toEqual([
      { symbol: "A7", reason: "timeout" },
      { symbol: "A8", reason: "timeout" },
    ]);

    const thin = await run(new Set(["A1", "A2", "A3", "A4", "A5"]));
    expect(thin.lifecycle).toBeNull();
    expect(thin.lifecycleReason).toContain("Insufficient market data");
  });
});

describe("radar snapshot cache", () => {
  const usable = { benchmark: { symbol: "BTC", return7d: 1, return7dPrior: 1, return30d: 1 }, assetsAvailable: 50 } as RadarSnapshot;
  const unusable = { benchmark: null, assetsAvailable: 0 } as RadarSnapshot;

  it("shares one in-flight load and reuses the snapshot within its TTL", async () => {
    let t = 0;
    let loads = 0;
    const get = createSnapshotCache(async () => (loads++, usable), { ttlMs: 1_000, failureTtlMs: 100, now: () => t });
    await Promise.all([get(), get(), get()]);
    expect(loads).toBe(1);
    t = 999;
    await get();
    expect(loads).toBe(1);
    t = 1_001;
    await get();
    expect(loads).toBe(2);
  });

  it("retries sooner after an unusable snapshot and never caches a failed load", async () => {
    let t = 0;
    let loads = 0;
    const get = createSnapshotCache(async () => (loads++, unusable), { ttlMs: 1_000, failureTtlMs: 100, now: () => t });
    await get();
    t = 101;
    await get();
    expect(loads).toBe(2);

    let attempts = 0;
    const flaky = createSnapshotCache(async () => {
      attempts++;
      if (attempts === 1) throw new Error("boom");
      return usable;
    });
    await expect(flaky()).rejects.toThrow("boom");
    await expect(flaky()).resolves.toBe(usable);
  });
});
