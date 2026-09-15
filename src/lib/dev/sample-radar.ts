/**
 * SAMPLE RADAR — synthetic candles for interface development only.
 *
 * These are NOT market data. Prices and volumes are generated from a seeded random
 * walk and fed through the real radar engine, so the UI can be built without network
 * access. Used only when NEXT_PUBLIC_DATA_MODE=sample; every screen labels it.
 */
import { buildRadarSnapshot } from "@/lib/radar/engine";
import { BENCHMARK_SYMBOL, NARRATIVES } from "@/lib/radar/taxonomy";
import type { AssetCandles, AssetPositioning, DailyCandle, MarketUniverse, RadarSnapshot } from "@/lib/radar/types";

const DAY_MS = 86_400_000;

/** Daily drift (%) for [days 1–30, the prior week, the latest week], and an optional volume multiplier. */
const PROFILES: Record<string, { drift: [number, number, number]; volume?: number; funding?: number }> = {
  [BENCHMARK_SYMBOL]: { drift: [0.1, 0.1, 0.1] },
  "ai-compute": { drift: [0.5, 0.4, 1.3] },
  rwa: { drift: [0, 0.05, 0.9] },
  "perp-dex": { drift: [1.1, 1, 1.2], volume: 1.9, funding: 0.0005 },
  memecoins: { drift: [1.2, 1.6, -0.4] },
  "layer-2": { drift: [-0.3, -0.2, -1] },
};

function random(seedText: string) {
  let seed = [...seedText].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 1);
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function candles(symbol: string, profile: (typeof PROFILES)[string], now: number): DailyCandle[] {
  const rand = random(symbol);
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  let price = 1 + rand() * 50;
  const baseVolume = 2e5 + rand() * 5e6;
  return Array.from({ length: 45 }, (_, i) => {
    const segment = i >= 37 ? 2 : i >= 30 ? 1 : 0;
    price *= 1 + (profile.drift[segment] + (rand() - 0.5) * 3) / 100;
    const volume = baseVolume * (i >= 37 ? (profile.volume ?? 1) : 1) * (0.8 + rand() * 0.4);
    return { ts: today - (44 - i) * DAY_MS, close: price, quoteVolume: volume };
  });
}

export function buildSampleRadar(now = Date.now()): RadarSnapshot {
  const universe: MarketUniverse = {
    fetchedAt: new Date(now).toISOString(),
    candles: {},
    positioning: {},
    positioningNote: null,
  };
  const neutral = { drift: [0.12, 0.1, 0.15] as [number, number, number] };
  const positioning: Record<string, AssetPositioning> = {};

  universe.candles[BENCHMARK_SYMBOL] = { ok: true, candles: candles(BENCHMARK_SYMBOL, PROFILES[BENCHMARK_SYMBOL], now), fetchedAt: universe.fetchedAt };
  for (const narrative of NARRATIVES) {
    const profile = PROFILES[narrative.id] ?? neutral;
    narrative.assets.forEach((symbol, i) => {
      if (universe.candles[symbol]) return;
      // One asset in the gaming basket is left unavailable so the partial-coverage state is visible.
      const entry: AssetCandles =
        narrative.id === "gaming" && i === 0
          ? { ok: false, reason: "timeout" }
          : { ok: true, candles: candles(symbol, profile, now), fetchedAt: universe.fetchedAt };
      universe.candles[symbol] = entry;
      positioning[symbol] = { funding8h: profile.funding ?? 0.0001, openInterestUsd: 1e7 + i * 1e6 };
    });
  }
  universe.positioning = positioning;
  return buildRadarSnapshot(universe, { mode: "sample", now });
}
