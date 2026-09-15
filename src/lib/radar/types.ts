import type { DataMode, NarrativeState } from "@/lib/types";

/** The candle fields the radar uses (structurally compatible with the Bitget connector's Candle). */
export interface DailyCandle {
  ts: number;
  close: number;
  quoteVolume: number;
}

export type AssetCandles = { ok: true; candles: DailyCandle[]; fetchedAt: string } | { ok: false; reason: string };

/** Perpetual-futures positioning for one asset. Funding is normalized to an 8h settlement. */
export interface AssetPositioning {
  funding8h: number | null;
  openInterestUsd: number | null;
}

/** Raw market data for one collection cycle, before any narrative math. */
export interface MarketUniverse {
  fetchedAt: string;
  candles: Record<string, AssetCandles>;
  /** Keyed by base symbol. null when the futures endpoints were unavailable. */
  positioning: Record<string, AssetPositioning> | null;
  positioningNote: string | null;
}

export interface AssetReading {
  symbol: string;
  /** Latest price vs the daily close 7 days earlier, %. */
  return7d: number;
  /** The 7 days before that, %. */
  return7dPrior: number;
  return30d: number;
  /** return7d minus the benchmark's return7d, percentage points. */
  relative7d: number;
  /** Average daily quote volume over the last 7 complete days vs the 21 complete days before, %. */
  volumeChange: number | null;
  funding8h: number | null;
  openInterestUsd: number | null;
  lastCandleAt: string;
}

export interface UnavailableAsset {
  symbol: string;
  reason: string;
}

export interface BenchmarkReading {
  symbol: string;
  return7d: number;
  return7dPrior: number;
  return30d: number;
}

export type CoverageLevel = "normal" | "reduced" | "insufficient";

export interface NarrativeCoverage {
  available: number;
  configured: number;
  share: number;
  level: CoverageLevel;
}

export interface NarrativeMetrics {
  median7d: number;
  medianPrior7d: number;
  median30d: number;
  /** Median 7d return minus benchmark 7d return, pts. */
  relative7d: number;
  relativePrior7d: number;
  relative30d: number;
  /** relative7d − relativePrior7d, pts. */
  momentumShift: number;
  positiveCount: number;
  /** Share of available assets with a positive 7d return. */
  breadth: number;
  outperformCount: number;
  /** Share of available assets beating the benchmark over 7d. */
  outperformShare: number;
  priorOutperformShare: number;
  /** outperformShare − priorOutperformShare. */
  participationShift: number;
  medianVolumeChange: number | null;
  volumeRisingCount: number;
  volumeCount: number;
  /** The largest positive contributor and its share of all positive 7d returns. */
  leader: { symbol: string; share: number } | null;
  concentrated: boolean;
  medianFunding8h: number | null;
  fundingCount: number;
  fundingElevated: boolean;
  openInterestUsd: number | null;
}

export type DataConfidence = "HIGH" | "MODERATE" | "LOW";

export type MomentumGlyph = "+++" | "++" | "+" | "·" | "−" | "−−" | "−−−";

export interface NarrativeReading {
  id: string;
  name: string;
  description: string;
  configuredAssets: string[];
  /** Available assets, strongest 7d return first. */
  assets: AssetReading[];
  unavailable: UnavailableAsset[];
  coverage: NarrativeCoverage;
  /** null when coverage is insufficient. */
  metrics: NarrativeMetrics | null;
  /** null = insufficient market data to classify. */
  lifecycle: NarrativeState | null;
  /** Deterministic statement of the rule that produced the lifecycle. */
  lifecycleReason: string;
  confidence: { level: DataConfidence; reasons: string[] } | null;
  momentum: MomentumGlyph | null;
  /** Median basket performance over ~30 days, normalized to 1 at the start. */
  trend: number[];
  /** Evidence that confirms the classification. */
  confirming: string[];
  /** Evidence that does not confirm it — what could make the reading wrong. */
  notConfirming: string[];
}

export interface RadarSnapshot {
  mode: DataMode;
  /** When the market data was retrieved. */
  generatedAt: string;
  /** The most recent daily candle timestamp across the universe. */
  dataAsOf: string | null;
  benchmark: BenchmarkReading | null;
  benchmarkError: string | null;
  /** Ranked: where to look first. */
  narratives: NarrativeReading[];
  assetsAvailable: number;
  assetsConfigured: number;
  positioningNote: string | null;
}

/** AI interpretation of a deterministic narrative reading. */
export interface NarrativeExplanation {
  summary: string;
  strongestEvidence: string[];
  weakeningEvidence: string[];
  investigateNext: string[];
}
