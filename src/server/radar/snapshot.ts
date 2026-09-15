/**
 * The live radar snapshot: one market-data cycle → every narrative reading.
 *
 * Cached in memory for a short period so the radar page, the narrative pages and
 * the thesis handoff all reuse the same dataset instead of re-requesting it.
 * A snapshot with no usable data is kept only briefly so the next visit retries.
 * No Redis or shared cache: this is per server process, by design.
 */
import { buildRadarSnapshot } from "@/lib/radar/engine";
import type { RadarSnapshot } from "@/lib/radar/types";
import { createBitgetRest, type BitgetRest } from "@/server/connectors/bitget-rest";
import { collectMarketUniverse } from "./market-data";

export const RADAR_CACHE = {
  /** Daily candles barely move in a few minutes; the page always shows the retrieval time. */
  ttlMs: 3 * 60_000,
  /** When the benchmark or every asset failed, retry soon. */
  failureTtlMs: 30_000,
} as const;

export async function loadLiveSnapshot(rest: BitgetRest = createBitgetRest()): Promise<RadarSnapshot> {
  const universe = await collectMarketUniverse(rest);
  return buildRadarSnapshot(universe, { mode: "live", now: Date.now() });
}

export type SnapshotLoader = () => Promise<RadarSnapshot>;

/** Wraps a loader with a TTL cache that also shares one in-flight request between callers. */
export function createSnapshotCache(
  load: SnapshotLoader,
  options: { ttlMs?: number; failureTtlMs?: number; now?: () => number } = {},
): SnapshotLoader {
  const ttlMs = options.ttlMs ?? RADAR_CACHE.ttlMs;
  const failureTtlMs = options.failureTtlMs ?? RADAR_CACHE.failureTtlMs;
  const now = options.now ?? Date.now;
  let entry: { expires: number; promise: Promise<RadarSnapshot> } | null = null;

  return () => {
    if (entry && now() < entry.expires) return entry.promise;
    const current = {
      expires: Number.POSITIVE_INFINITY,
      promise: load().then(
        (snapshot) => {
          const unusable = snapshot.benchmark === null || snapshot.assetsAvailable === 0;
          current.expires = now() + (unusable ? failureTtlMs : ttlMs);
          return snapshot;
        },
        (err: unknown) => {
          if (entry === current) entry = null;
          throw err;
        },
      ),
    };
    entry = current;
    return current.promise;
  };
}

// Stored on globalThis so every route bundle in this server process shares one cache.
const store = globalThis as typeof globalThis & { __kmtRadarSnapshot?: SnapshotLoader };

export function getRadarSnapshot(): Promise<RadarSnapshot> {
  store.__kmtRadarSnapshot ??= createSnapshotCache(() => loadLiveSnapshot());
  return store.__kmtRadarSnapshot();
}
