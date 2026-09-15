import { describe, expect, it } from "vitest";
import {
  buildRadarSnapshot,
  classifyLifecycle,
  coverageOf,
  median,
  readAssetCandles,
  startingTheses,
} from "./engine";
import type { NarrativeDefinition } from "./taxonomy";
import { DAY, NOW, series, universe, type SeriesSpec } from "./test-helpers";
import type { MarketUniverse, NarrativeMetrics, NarrativeReading } from "./types";

const BTC: SeriesSpec = { r7: 1, prior7: 1, r30: 2 };
const FLAT_BTC: SeriesSpec = { r7: 0, prior7: 0, r30: 0 };
const symbols = (n: number, prefix = "A") => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const def = (assets: string[], id = "test", name = "Test Basket"): NarrativeDefinition => ({ id, name, description: "test", assets });

function readingOf(entries: Record<string, SeriesSpec | string>, assets: string[], positioning?: MarketUniverse["positioning"]): NarrativeReading {
  return buildRadarSnapshot(universe(entries, { positioning }), { mode: "live", now: NOW, narratives: [def(assets)] }).narratives[0];
}

const basket = (specs: (SeriesSpec | string)[], benchmark: SeriesSpec = BTC) => {
  const assets = symbols(specs.length);
  return { assets, entries: { BTC: benchmark, ...Object.fromEntries(assets.map((s, i) => [s, specs[i]])) } };
};

describe("radar statistics", () => {
  it("computes a robust median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([1, Number.NaN, 3])).toBe(2);
    expect(median([])).toBeNull();
  });

  it("reads 7-day, prior-week and 30-day returns and ignores the partial candle's volume", () => {
    const read = readAssetCandles(series({ r7: 10, prior7: -5, r30: 20, volumeRecent: 1500, volumeBase: 1000 }), NOW);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.reading.return7d).toBeCloseTo(10, 9);
    expect(read.reading.return7dPrior).toBeCloseTo(-5, 9);
    expect(read.reading.return30d).toBeCloseTo(20, 9);
    // The partial candle carries 9,999,999 of volume; only complete days count.
    expect(read.reading.volumeChange).toBeCloseTo(50, 9);
    expect(read.trend).toHaveLength(31);
    expect(read.trend[0]).toBe(1);
  });

  it("marks short, stale and invalid series unavailable", () => {
    expect(readAssetCandles(series({ r7: 1, length: 20 }), NOW)).toEqual({ ok: false, reason: "insufficient history (20 daily candles)" });
    expect(readAssetCandles(series({ r7: 1 }, NOW - 5 * DAY), NOW)).toEqual({ ok: false, reason: "stale data" });
    const broken = series({ r7: 1 });
    broken[10] = { ...broken[10], close: 0 };
    expect(readAssetCandles(broken, NOW)).toEqual({ ok: false, reason: "invalid candle values" });
  });

  it("applies the documented coverage thresholds", () => {
    expect(coverageOf(3, 8).level).toBe("insufficient");
    expect(coverageOf(2, 3).level).toBe("insufficient"); // 67%, but fewer than 3 assets
    expect(coverageOf(5, 8).level).toBe("reduced");
    expect(coverageOf(6, 8).level).toBe("normal");
  });
});

describe("narrative breadth and relative performance", () => {
  it("positive breadth: every asset up and beating BTC → accelerating with high confidence", () => {
    const { assets, entries } = basket(Array.from({ length: 8 }, () => ({ r7: 8, prior7: 8, r30: 10 })));
    const r = readingOf(entries, assets);
    expect(r.metrics).toMatchObject({ positiveCount: 8, breadth: 1, outperformCount: 8, outperformShare: 1 });
    expect(r.metrics?.relative7d).toBeCloseTo(7, 9);
    expect(r.lifecycle).toBe("ACCELERATING");
    expect(r.confidence?.level).toBe("HIGH");
    expect(r.momentum).toBe("++");
    expect(r.confirming).toContain("8 of 8 tracked assets outperformed BTC over 7 days.");
  });

  it("negative breadth: every asset down and lagging BTC → fading", () => {
    const { assets, entries } = basket(Array.from({ length: 8 }, () => ({ r7: -6, prior7: -1, r30: -8 })));
    const r = readingOf(entries, assets);
    expect(r.metrics).toMatchObject({ positiveCount: 0, breadth: 0, outperformCount: 0 });
    expect(r.metrics?.relative7d).toBeCloseTo(-7, 9);
    expect(r.lifecycle).toBe("FADING");
    expect(r.confirming).toContain("8 of 8 tracked assets underperformed BTC over 7 days.");
  });

  it("mixed breadth: half up, half down → median 0 and stable", () => {
    const specs = [5, 5, 5, 5, -5, -5, -5, -5].map((r7) => ({ r7, prior7: r7, r30: r7 }));
    const { assets, entries } = basket(specs, FLAT_BTC);
    const r = readingOf(entries, assets);
    expect(r.metrics?.breadth).toBe(0.5);
    expect(r.metrics?.median7d).toBeCloseTo(0, 9);
    expect(r.lifecycle).toBe("STABLE");
    expect(r.notConfirming.some((t) => t.startsWith("4 of 8 tracked assets underperformed BTC"))).toBe(true);
  });

  it("one token rallying 30% while the rest are flat does not make the narrative accelerate", () => {
    const specs = [{ r7: 30, prior7: 0, r30: 30 }, ...Array.from({ length: 7 }, () => ({ r7: 0, prior7: 0, r30: 0 }))];
    const { assets, entries } = basket(specs, FLAT_BTC);
    const r = readingOf(entries, assets);
    expect(r.metrics?.median7d).toBeCloseTo(0, 9);
    expect(r.metrics?.breadth).toBe(1 / 8);
    expect(r.lifecycle).not.toBe("ACCELERATING");
    expect(r.notConfirming.some((t) => t.startsWith("Participation is narrow: only A1 +30.0%"))).toBe(true);
  });

  it("flags concentrated gains and lowers data confidence", () => {
    const specs = [40, 2, 2, 1, 1, 0, 0, 0].map((r7) => ({ r7, prior7: r7, r30: r7 }));
    const { assets, entries } = basket(specs, FLAT_BTC);
    const r = readingOf(entries, assets);
    expect(r.metrics?.concentrated).toBe(true);
    expect(r.metrics?.leader?.symbol).toBe("A1");
    expect(r.metrics?.leader?.share).toBeCloseTo(40 / 46, 9);
    expect(r.confidence?.level).toBe("MODERATE");
    expect(r.notConfirming.some((t) => t.startsWith("Gains are concentrated: A1 supplies 87%"))).toBe(true);
  });

  it("measures relative performance against BTC and the median volume change", () => {
    const specs = [10, 6, 4].map((r7) => ({ r7, prior7: 0, r30: r7, volumeRecent: 1200 + r7 * 10 }));
    const { assets, entries } = basket(specs, { r7: 2, prior7: 0, r30: 2 });
    const r = readingOf(entries, assets);
    expect(r.metrics?.median7d).toBeCloseTo(6, 9);
    expect(r.metrics?.relative7d).toBeCloseTo(4, 9);
    expect(r.metrics?.medianVolumeChange).toBeCloseTo(26, 9);
    expect(r.assets.map((a) => a.symbol)).toEqual(["A1", "A2", "A3"]);
    expect(r.assets[0].relative7d).toBeCloseTo(8, 9);
  });

  it("only treats funding as elevated when at least half the assets have it", () => {
    const { assets, entries } = basket(Array.from({ length: 8 }, () => ({ r7: 8 })));
    const hot = (count: number) =>
      Object.fromEntries(assets.slice(0, count).map((s) => [s, { funding8h: 0.001, openInterestUsd: 1e6 }]));
    expect(readingOf(entries, assets, hot(3)).metrics).toMatchObject({ fundingElevated: false, fundingCount: 3 });
    expect(readingOf(entries, assets, hot(5)).metrics).toMatchObject({ fundingElevated: true, fundingCount: 5, openInterestUsd: 5e6 });
    expect(readingOf(entries, assets).metrics).toMatchObject({ medianFunding8h: null, fundingCount: 0, openInterestUsd: null });
  });
});

describe("lifecycle classification", () => {
  const base: NarrativeMetrics = {
    median7d: 0,
    medianPrior7d: 0,
    median30d: 0,
    relative7d: 0,
    relativePrior7d: 0,
    relative30d: 0,
    momentumShift: 0,
    positiveCount: 5,
    breadth: 0.5,
    outperformCount: 5,
    outperformShare: 0.5,
    priorOutperformShare: 0.5,
    participationShift: 0,
    medianVolumeChange: 0,
    volumeRisingCount: 5,
    volumeCount: 10,
    leader: null,
    concentrated: false,
    medianFunding8h: 0.0001,
    fundingCount: 10,
    fundingElevated: false,
    openInterestUsd: null,
  };
  const classify = (overrides: Partial<NarrativeMetrics>) => classifyLifecycle({ ...base, ...overrides }, 10);

  it("CROWDED: strong after an extended run, with elevated funding or a volume surge", () => {
    const funding = classify({ relative7d: 5, outperformShare: 0.8, relative30d: 20, fundingElevated: true, medianFunding8h: 0.0005 });
    expect(funding.state).toBe("CROWDED");
    expect(funding.reason).toContain("median funding is +0.0500% per 8h");
    expect(classify({ relative7d: 5, outperformShare: 0.8, relative30d: 20, medianVolumeChange: 80 }).state).toBe("CROWDED");
  });

  it("ACCELERATING: strong without deterioration, even after an extended run without crowding", () => {
    expect(classify({ relative7d: 5, outperformShare: 0.7 }).state).toBe("ACCELERATING");
    expect(classify({ relative7d: 5, outperformShare: 0.8, relative30d: 20 }).state).toBe("ACCELERATING");
  });

  it("EXHAUSTING: elevated momentum with slowing momentum or falling participation", () => {
    const slowing = classify({ relative30d: 20, relative7d: 1, relativePrior7d: 6, momentumShift: -5 });
    expect(slowing.state).toBe("EXHAUSTING");
    expect(slowing.reason).toContain("relative momentum slowed from +6.0 pts to +1.0 pts");
    expect(classify({ relative7d: 5, outperformShare: 0.6, priorOutperformShare: 0.9, participationShift: -0.3 }).state).toBe("EXHAUSTING");
  });

  it("EMERGING: improving before a large run, but not once the run is extended", () => {
    const early = { relative7d: 2, outperformShare: 0.6, momentumShift: 4, relativePrior7d: -2, relative30d: 5 };
    expect(classify(early).state).toBe("EMERGING");
    expect(classify({ ...early, relative30d: 20 }).state).toBe("STABLE");
  });

  it("FADING: weak, or negative and deteriorating", () => {
    expect(classify({ relative7d: -4, outperformShare: 0.3 }).state).toBe("FADING");
    expect(classify({ relative7d: -1, outperformShare: 0.4, momentumShift: -4 }).state).toBe("FADING");
  });

  it("STABLE: no threshold met", () => {
    const stable = classify({});
    expect(stable.state).toBe("STABLE");
    expect(stable.reason).toContain("No lifecycle threshold was met");
  });
});

describe("coverage and ranking", () => {
  it("refuses to classify a narrative with insufficient coverage", () => {
    const { assets, entries } = basket([{ r7: 9 }, { r7: 9 }, { r7: 9 }, "timeout", "not listed", "timeout", "source error", "timeout"]);
    const r = readingOf(entries, assets);
    expect(r.coverage).toMatchObject({ available: 3, configured: 8, level: "insufficient" });
    expect(r.lifecycle).toBeNull();
    expect(r.metrics).toBeNull();
    expect(r.confidence).toBeNull();
    expect(r.trend).toEqual([]);
    expect(r.lifecycleReason).toContain("Insufficient market data to classify this narrative");
    expect(r.unavailable).toContainEqual({ symbol: "A5", reason: "not listed" });
  });

  it("classifies partial coverage with reduced confidence and lists the gaps", () => {
    const { assets, entries } = basket([...Array.from({ length: 5 }, () => ({ r7: 8 })), "timeout", "timeout", "not listed"]);
    const r = readingOf(entries, assets);
    expect(r.coverage.level).toBe("reduced");
    expect(r.lifecycle).not.toBeNull();
    expect(r.confidence?.level).toBe("MODERATE");
    expect(r.notConfirming).toContain("3 of 8 tracked assets had no usable data (A6, A7, A8).");
  });

  it("does not classify anything without the BTC benchmark", () => {
    const { assets, entries } = basket(Array.from({ length: 6 }, () => ({ r7: 8 })));
    const snapshot = buildRadarSnapshot(universe({ ...entries, BTC: "timeout" }), { mode: "live", now: NOW, narratives: [def(assets)] });
    expect(snapshot.benchmark).toBeNull();
    expect(snapshot.benchmarkError).toBe("BTC unavailable · timeout");
    expect(snapshot.narratives[0].lifecycle).toBeNull();
    expect(snapshot.narratives[0].lifecycleReason).toContain("BTC benchmark is unavailable");
  });

  it("ranks by stage priority and puts unclassified narratives last", () => {
    const entries: Record<string, SeriesSpec | string> = { BTC };
    const up = symbols(6, "U");
    const down = symbols(6, "D");
    const gone = symbols(6, "G");
    for (const s of up) entries[s] = { r7: 9, prior7: 9, r30: 12 };
    for (const s of down) entries[s] = { r7: -8, prior7: -2, r30: -10 };
    for (const s of gone) entries[s] = "timeout";
    const snapshot = buildRadarSnapshot(universe(entries), {
      mode: "live",
      now: NOW,
      narratives: [def(gone, "gone"), def(down, "down"), def(up, "up"), def([...up.slice(0, 3), ...down.slice(0, 3)], "shared")],
    });
    expect(snapshot.narratives.map((n) => [n.id, n.lifecycle])).toEqual([
      ["up", "ACCELERATING"],
      ["down", "FADING"],
      ["shared", "STABLE"],
      ["gone", null],
    ]);
    // Shared assets are counted once.
    expect(snapshot.assetsConfigured).toBe(18);
    expect(snapshot.assetsAvailable).toBe(12);
    expect(snapshot.dataAsOf).toBe(new Date(Math.floor(NOW / DAY) * DAY).toISOString());
  });

  it("suggests editable starting theses that match the stage", () => {
    expect(startingTheses({ name: "AI / Compute", lifecycle: "ACCELERATING" }).form).toBe("I think the AI / Compute narrative has further to run.");
    expect(startingTheses({ name: "AI / Compute", lifecycle: "ACCELERATING" }).kill).toBe("I think the current AI / Compute rotation has further upside.");
    expect(startingTheses({ name: "Layer 2", lifecycle: "FADING" }).form).toContain("losing momentum");
  });
});
