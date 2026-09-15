import { describe, expect, it } from "vitest";
import { atrPercent, macd, percentChange, rangePosition, rsi, sma } from "./indicators";
import { syntheticCandles } from "./test-fixtures";

describe("indicators", () => {
  const rising = Array.from({ length: 60 }, (_, i) => 100 + i);

  it("computes simple values", () => {
    expect(sma([1, 2, 3, 4], 2)).toBe(3.5);
    expect(sma([1], 2)).toBeNull();
    expect(percentChange([100, 110], 1)).toBeCloseTo(10);
  });

  it("computes RSI at the extremes", () => {
    expect(rsi(rising)).toBe(100);
    expect(rsi([...rising].reverse())).toBe(0);
    expect(rsi([1, 2, 3])).toBeNull();
  });

  it("computes MACD, ATR and range position from candles", () => {
    expect(macd(rising)?.macd).toBeGreaterThan(0);
    const candles = syntheticCandles(40);
    expect(atrPercent(candles)).toBeGreaterThan(0);
    expect(rangePosition(candles, 30)?.position).toBeGreaterThan(90);
  });
});
