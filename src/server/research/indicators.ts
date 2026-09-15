/**
 * Deterministic technical indicators computed from Bitget candles.
 * (The Signal MCP `technical_analysis` tool was observed returning internally
 * inconsistent values, e.g. Bollinger upper < lower, so we compute locally.)
 * All functions return null when there is not enough data.
 */
import type { Candle } from "@/server/connectors/bitget-rest";

export function sma(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  const window = values.slice(-period);
  return window.reduce((a, b) => a + b, 0) / period;
}

export function emaSeries(values: number[], period: number): number[] | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out = [prev];
  for (const v of values.slice(period)) {
    prev = v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const fastE = emaSeries(closes, fast);
  const slowE = emaSeries(closes, slow);
  if (!fastE || !slowE) return null;
  const offset = slow - fast;
  const line = slowE.map((s, i) => fastE[i + offset] - s);
  const signal = emaSeries(line, signalPeriod);
  if (!signal || signal.length < 2) return null;
  const hist = signal.map((s, i) => line[i + signalPeriod - 1] - s);
  return {
    macd: line[line.length - 1],
    signal: signal[signal.length - 1],
    histogram: hist[hist.length - 1],
    previousHistogram: hist[hist.length - 2],
  };
}

/** Average true range as a percentage of the last close. */
export function atrPercent(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
  }
  const atr = sma(trs, period);
  const last = candles[candles.length - 1].close;
  return atr === null || last === 0 ? null : (atr / last) * 100;
}

/** Percent change over the last `bars` bars. */
export function percentChange(closes: number[], bars: number): number | null {
  if (closes.length <= bars) return null;
  const from = closes[closes.length - 1 - bars];
  return from === 0 ? null : ((closes[closes.length - 1] - from) / from) * 100;
}

/** Where the last close sits inside the high–low range of the last `bars` candles (0 = low, 100 = high). */
export function rangePosition(candles: Candle[], bars: number) {
  if (candles.length < bars) return null;
  const window = candles.slice(-bars);
  const high = Math.max(...window.map((c) => c.high));
  const low = Math.min(...window.map((c) => c.low));
  const last = window[window.length - 1].close;
  if (high === low) return null;
  return { high, low, position: ((last - low) / (high - low)) * 100 };
}

export const round = (n: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** Price precision appropriate to the asset (BTC 78155.39 → 2dp, DOGE 0.0835 → 4dp). */
export function formatPrice(n: number) {
  const digits = n >= 100 ? 2 : n >= 1 ? 3 : n >= 0.01 ? 4 : 6;
  return n.toFixed(digits);
}

export const formatPct = (n: number, digits = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
