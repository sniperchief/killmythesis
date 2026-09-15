/**
 * Test-only builders for Narrative Radar. Imported by *.test.ts files only; never used by the application.
 */
import type { Candle } from "@/server/connectors/bitget-rest";
import type { DailyCandle, MarketUniverse } from "./types";

export const DAY = 86_400_000;
/** Noon UTC, so the last daily candle is today's partial candle. */
export const NOW = Date.UTC(2026, 8, 15, 12);

export interface SeriesSpec {
  /** 7-day return, %. */
  r7: number;
  /** Return over the 7 days before that, %. Defaults to r7. */
  prior7?: number;
  /** 30-day return, %. Defaults to r7 + prior7. */
  r30?: number;
  /** Mean quote volume over the last 7 complete days (default 1000). */
  volumeRecent?: number;
  /** Quote volume on the other days (default 1000). */
  volumeBase?: number;
  length?: number;
}

/** 45 daily candles hitting the requested returns exactly; the partial last candle has an outsized volume. */
export function series(spec: SeriesSpec, now = NOW): DailyCandle[] {
  const n = spec.length ?? 45;
  const today = Math.floor(now / DAY) * DAY;
  const prior7 = spec.prior7 ?? spec.r7;
  const r30 = spec.r30 ?? spec.r7 + prior7;

  const closes = new Array<number>(n).fill(100);
  if (n >= 31) {
    const last = 100 * (1 + r30 / 100);
    const c8 = last / (1 + spec.r7 / 100);
    const c15 = c8 / (1 + prior7 / 100);
    const anchors: [number, number][] = [
      [n - 31, 100],
      [n - 15, c15],
      [n - 8, c8],
      [n - 1, last],
    ];
    for (let j = 0; j < anchors.length - 1; j++) {
      const [i0, v0] = anchors[j];
      const [i1, v1] = anchors[j + 1];
      for (let i = i0; i <= i1; i++) closes[i] = v0 + ((v1 - v0) * (i - i0)) / (i1 - i0);
    }
  }

  return closes.map((close, i) => ({
    ts: today - (n - 1 - i) * DAY,
    close,
    quoteVolume: i === n - 1 ? 9_999_999 : i >= n - 8 ? (spec.volumeRecent ?? 1000) : (spec.volumeBase ?? 1000),
  }));
}

export const toCandles = (daily: DailyCandle[]): Candle[] =>
  daily.map((d) => ({ ts: d.ts, open: d.close, high: d.close, low: d.close, close: d.close, volume: 1, quoteVolume: d.quoteVolume }));

/** A market universe from specs; a string value is an unavailable asset with that reason. */
export function universe(
  entries: Record<string, SeriesSpec | string>,
  options: { positioning?: MarketUniverse["positioning"]; now?: number } = {},
): MarketUniverse {
  const fetchedAt = new Date(options.now ?? NOW).toISOString();
  return {
    fetchedAt,
    candles: Object.fromEntries(
      Object.entries(entries).map(([symbol, spec]) => [
        symbol,
        typeof spec === "string" ? { ok: false, reason: spec } : { ok: true, candles: series(spec, options.now), fetchedAt },
      ]),
    ),
    positioning: options.positioning ?? null,
    positioningNote: null,
  };
}
