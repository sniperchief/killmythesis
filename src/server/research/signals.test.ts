import { describe, expect, it } from "vitest";
import { measurableSignals, renderCondition } from "./signals";
import type { RawFinding } from "./types";

const finding = (id: string, rawValue: unknown, dimension: RawFinding["dimension"] = "technical"): RawFinding => ({
  id,
  dimension,
  source: "test",
  topic: id === "ms-range" ? "90-day range" : "topic",
  observation: "observation",
  timestamp: "2026-09-15T00:00:00.000Z",
  rawValue,
});

describe("measurable invalidation signals", () => {
  it("takes current values and levels from the data itself", () => {
    const [trend, volume] = measurableSignals(
      [finding("ta-trend", { close: 150, sma20: 143, sma50: 139 }), finding("ms-volume", { avg7d: 120, avg30d: 100 }, "market_structure")],
      "LONG",
      "SOL",
    );
    expect(trend).toMatchObject({ label: "SOL daily close", current: 150, currentText: "150.00" });
    expect(trend.thresholds.map((t) => [t.value, t.text])).toEqual([
      [139, "the 50-day SMA (139.00)"],
      [143, "the 20-day SMA (143.00)"],
    ]);
    expect(volume).toMatchObject({ current: 1.2, currentText: "1.20×" });
    expect(volume.thresholds.map((t) => t.text)).toEqual(["1.00×"]);
  });

  it("offers only thresholds that contradict the thesis and have not been crossed", () => {
    const data = [finding("ta-rsi", { rsiDaily: 64, rsi4h: 55 }), finding("pos-funding-now", { fundingRate: -0.0002 }, "positioning")];

    const long = measurableSignals(data, "LONG");
    // Funding is already negative, so "falls below 0%" is not a future invalidation for a long.
    expect(long.map((s) => s.findingId)).toEqual(["ta-rsi"]);
    expect(long[0].thresholds.map((t) => t.comparator)).toEqual(["below"]);

    const short = measurableSignals(data, "SHORT");
    expect(short.map((s) => [s.findingId, s.thresholds.map((t) => `${t.comparator} ${t.text}`)])).toEqual([
      ["pos-funding-now", ["above 0%"]],
    ]);
  });

  it("produces nothing from malformed values or findings without a measurable value", () => {
    expect(
      measurableSignals(
        [
          finding("ta-trend", { close: "150", sma20: 143, sma50: 139 }),
          finding("ta-rsi", { rsiDaily: null, rsi4h: 40 }),
          finding("news-1", { title: "headline" }, "news"),
          finding("macro-fed", { effective: 4.33 }, "macro"),
        ],
        "LONG",
      ),
    ).toEqual([]);
  });

  it("measures a narrative on its radar breadth, relative performance and participation", () => {
    const signals = measurableSignals(
      [finding("radar-reading", { metrics: { breadth: 0.75, relative7d: 4.2, outperformShare: 0.625 } }, "market_structure")],
      "NARRATIVE",
    );
    expect(signals.map((s) => [s.label, s.currentText])).toEqual([
      ["Narrative breadth (share of assets up over 7 days)", "75%"],
      ["Narrative median 7-day return vs BTC", "+4.2 pts"],
      ["Share of narrative assets beating BTC over 7 days", "63%"],
    ]);
  });

  it("renders a compound condition as X while Y", () => {
    const [breadth, relative] = measurableSignals(
      [finding("radar-reading", { metrics: { breadth: 0.75, relative7d: 4.2, outperformShare: 0.625 } }, "market_structure")],
      "NARRATIVE",
    );
    expect(renderCondition([{ signal: breadth, threshold: breadth.thresholds[0] }, { signal: relative, threshold: relative.thresholds[0] }])).toBe(
      "The thesis is weakened if Narrative breadth (share of assets up over 7 days) falls below 50% (now 75%) while Narrative median 7-day return vs BTC falls below 0 pts (now +4.2 pts).",
    );
  });
});
