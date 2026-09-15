/**
 * NARRATIVE RADAR ENGINE — deterministic, no LLM.
 *
 * Input: daily Bitget spot candles for every basket asset plus the benchmark (BTC),
 * and optional perpetual-futures positioning. Output: one reading per narrative.
 *
 * PER ASSET (from daily closes; the last candle is today's partial day, so its close is the latest price)
 *   return7d       latest price vs the close 7 daily candles earlier
 *   return7dPrior  the 7 days before that (close[n-8] vs close[n-15])
 *   return30d      latest price vs the close 30 daily candles earlier
 *   relative7d     return7d − BTC return7d (percentage points)
 *   volumeChange   mean quote volume of the last 7 COMPLETE days vs the 21 complete days before (%)
 *   funding8h      current funding rate normalized to an 8h settlement (rate × 8 / interval hours)
 *   An asset is unavailable when its request failed, it has < 31 candles, prices are invalid,
 *   or its latest candle is more than 2 days old.
 *
 * PER NARRATIVE (robust statistics: medians and counts, so one extreme token cannot define the basket)
 *   coverage       available / configured assets
 *                  < 50% (or < 3 assets) → insufficient, no classification
 *                  50–74% → reduced confidence;  ≥ 75% → normal
 *   relative7d     median return7d − BTC return7d;  relativePrior7d and relative30d likewise
 *   momentumShift  relative7d − relativePrior7d
 *   breadth        share of assets with return7d > 0
 *   outperform     share of assets with return7d > BTC return7d;  participationShift = outperform − prior-week outperform
 *   concentrated   ≥ 4 assets, ≥ 3 rising, and the top riser supplies ≥ 50% of the summed positive returns
 *   fundingElevated median funding8h ≥ 0.03% (3× the 0.01% baseline) across at least half the available assets
 *
 * LIFECYCLE (first matching rule wins; thresholds in RADAR_RULES)
 *   strong        = relative7d ≥ +3 pts AND outperform ≥ 60%
 *   weak          = relative7d ≤ −3 pts AND outperform ≤ 40%
 *   improving     = momentumShift ≥ +3 pts OR participationShift ≥ +20 pts
 *   deteriorating = momentumShift ≤ −3 pts OR participationShift ≤ −20 pts
 *   extended      = relative30d ≥ +15 pts
 *   1 CROWDED      strong AND extended AND (fundingElevated OR median volumeChange ≥ +50%)
 *   2 EXHAUSTING   (extended OR strong) AND deteriorating AND NOT weak
 *   3 ACCELERATING strong (deterioration was ruled out by rule 2)
 *   4 EMERGING     improving AND NOT deteriorating AND NOT extended AND relative7d > 0 AND outperform ≥ 50%
 *   5 FADING       weak OR (relative7d < 0 AND deteriorating AND outperform < 50%)
 *   6 STABLE       otherwise
 *
 * DATA CONFIDENCE (about data quality and signal agreement — never a probability)
 *   start HIGH (normal coverage) or MODERATE (reduced coverage);
 *   one level down if the median and breadth disagree in direction; one level down if gains are concentrated.
 */
import { NARRATIVE_STATE_ORDER } from "@/lib/labels";
import type { DataMode, NarrativeState } from "@/lib/types";
import { BENCHMARK_SYMBOL, NARRATIVES, type NarrativeDefinition } from "./taxonomy";
import type {
  AssetReading,
  BenchmarkReading,
  DailyCandle,
  DataConfidence,
  MarketUniverse,
  MomentumGlyph,
  NarrativeCoverage,
  NarrativeMetrics,
  NarrativeReading,
  RadarSnapshot,
  UnavailableAsset,
} from "./types";

const DAY_MS = 86_400_000;

export const RADAR_RULES = {
  minCandles: 31,
  volumeRecentDays: 7,
  volumeBaseDays: 21,
  staleAfterMs: 2 * DAY_MS,
  coverage: { insufficientBelow: 0.5, reducedBelow: 0.75, minAssets: 3 },
  strongRelative7d: 3,
  weakRelative7d: -3,
  strongParticipation: 0.6,
  weakParticipation: 0.4,
  momentumShift: 3,
  participationShift: 0.2,
  extendedRelative30d: 15,
  volumeSurge: 50,
  fundingElevated8h: 0.0003,
  concentrationShare: 0.5,
} as const;

// ─── Formatting (shared with the UI and the explanation facts) ───────────────

function signed(n: number, digits: number, suffix: string) {
  const rounded = Number(n.toFixed(digits));
  const text = Math.abs(rounded).toFixed(digits);
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${text}${suffix}`;
}

export const fmtPct = (n: number) => signed(n, 1, "%");
export const fmtPts = (n: number) => signed(n, 1, " pts");
export const fmtShare = (share: number) => `${Math.round(share * 100)}%`;
export const fmtFunding = (rate: number) => signed(rate * 100, 4, "%");

export function fmtUsd(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

// ─── Statistics ──────────────────────────────────────────────────────────────

export function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const change = (from: number, to: number) => ((to - from) / from) * 100;

// ─── Assets ──────────────────────────────────────────────────────────────────

type AssetRead =
  | { ok: true; reading: Omit<AssetReading, "relative7d" | "funding8h" | "openInterestUsd">; trend: number[] }
  | { ok: false; reason: string };

export function readAssetCandles(raw: DailyCandle[], now: number): AssetRead {
  const candles = [...raw].sort((a, b) => a.ts - b.ts);
  if (candles.length < RADAR_RULES.minCandles) {
    return { ok: false, reason: `insufficient history (${candles.length} daily candles)` };
  }
  if (!candles.every((c) => Number.isFinite(c.ts) && Number.isFinite(c.close) && c.close > 0 && Number.isFinite(c.quoteVolume) && c.quoteVolume >= 0)) {
    return { ok: false, reason: "invalid candle values" };
  }
  const last = candles[candles.length - 1];
  if (now - last.ts > RADAR_RULES.staleAfterMs) return { ok: false, reason: "stale data" };

  const closes = candles.map((c) => c.close);
  const n = closes.length;
  const complete = candles.filter((c) => c.ts + DAY_MS <= now);
  const { volumeRecentDays: recentDays, volumeBaseDays: baseDays } = RADAR_RULES;
  let volumeChange: number | null = null;
  if (complete.length >= recentDays + baseDays) {
    const recent = mean(complete.slice(-recentDays).map((c) => c.quoteVolume));
    const base = mean(complete.slice(-(recentDays + baseDays), -recentDays).map((c) => c.quoteVolume));
    volumeChange = base > 0 ? change(base, recent) : null;
  }

  const start = closes[n - 31];
  return {
    ok: true,
    reading: {
      symbol: "",
      return7d: change(closes[n - 8], closes[n - 1]),
      return7dPrior: change(closes[n - 15], closes[n - 8]),
      return30d: change(start, closes[n - 1]),
      volumeChange,
      lastCandleAt: new Date(last.ts).toISOString(),
    },
    trend: closes.slice(-31).map((c) => c / start),
  };
}

export function readBenchmark(universe: MarketUniverse, now: number): { benchmark: BenchmarkReading | null; error: string | null } {
  const data = universe.candles[BENCHMARK_SYMBOL];
  if (!data) return { benchmark: null, error: `${BENCHMARK_SYMBOL} data was not collected` };
  if (!data.ok) return { benchmark: null, error: `${BENCHMARK_SYMBOL} unavailable · ${data.reason}` };
  const read = readAssetCandles(data.candles, now);
  if (!read.ok) return { benchmark: null, error: `${BENCHMARK_SYMBOL} unavailable · ${read.reason}` };
  const { return7d, return7dPrior, return30d } = read.reading;
  return { benchmark: { symbol: BENCHMARK_SYMBOL, return7d, return7dPrior, return30d }, error: null };
}

// ─── Narrative metrics ───────────────────────────────────────────────────────

export function coverageOf(available: number, configured: number): NarrativeCoverage {
  const share = configured > 0 ? available / configured : 0;
  const { insufficientBelow, reducedBelow, minAssets } = RADAR_RULES.coverage;
  const level = share < insufficientBelow || available < minAssets ? "insufficient" : share < reducedBelow ? "reduced" : "normal";
  return { available, configured, share, level };
}

export function computeMetrics(assets: AssetReading[], benchmark: BenchmarkReading): NarrativeMetrics {
  const k = assets.length;
  const median7d = median(assets.map((a) => a.return7d)) ?? 0;
  const medianPrior7d = median(assets.map((a) => a.return7dPrior)) ?? 0;
  const median30d = median(assets.map((a) => a.return30d)) ?? 0;
  const relative7d = median7d - benchmark.return7d;
  const relativePrior7d = medianPrior7d - benchmark.return7dPrior;

  const positive = assets.filter((a) => a.return7d > 0);
  const outperformCount = assets.filter((a) => a.return7d > benchmark.return7d).length;
  const outperformShare = outperformCount / k;
  const priorOutperformShare = assets.filter((a) => a.return7dPrior > benchmark.return7dPrior).length / k;

  const volumes = assets.map((a) => a.volumeChange).filter((v): v is number => v !== null);
  const funding = assets.map((a) => a.funding8h).filter((f): f is number => f !== null);
  const oi = assets.map((a) => a.openInterestUsd).filter((v): v is number => v !== null);

  const positiveSum = positive.reduce((sum, a) => sum + a.return7d, 0);
  const top = positive.reduce<AssetReading | null>((best, a) => (!best || a.return7d > best.return7d ? a : best), null);
  const leader = top && positiveSum > 0 ? { symbol: top.symbol, share: top.return7d / positiveSum } : null;
  const medianFunding8h = median(funding);

  return {
    median7d,
    medianPrior7d,
    median30d,
    relative7d,
    relativePrior7d,
    relative30d: median30d - benchmark.return30d,
    momentumShift: relative7d - relativePrior7d,
    positiveCount: positive.length,
    breadth: positive.length / k,
    outperformCount,
    outperformShare,
    priorOutperformShare,
    participationShift: outperformShare - priorOutperformShare,
    medianVolumeChange: median(volumes),
    volumeRisingCount: volumes.filter((v) => v > 0).length,
    volumeCount: volumes.length,
    leader,
    concentrated: k >= 4 && positive.length >= 3 && leader !== null && leader.share >= RADAR_RULES.concentrationShare,
    medianFunding8h,
    fundingCount: funding.length,
    fundingElevated:
      medianFunding8h !== null && funding.length >= Math.ceil(k / 2) && medianFunding8h >= RADAR_RULES.fundingElevated8h,
    openInterestUsd: oi.length ? oi.reduce((a, b) => a + b, 0) : null,
  };
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

export function classifyLifecycle(m: NarrativeMetrics, assetCount: number): { state: NarrativeState; reason: string } {
  const R = RADAR_RULES;
  const strong = m.relative7d >= R.strongRelative7d && m.outperformShare >= R.strongParticipation;
  const weak = m.relative7d <= R.weakRelative7d && m.outperformShare <= R.weakParticipation;
  const improving = m.momentumShift >= R.momentumShift || m.participationShift >= R.participationShift;
  const deteriorating = m.momentumShift <= -R.momentumShift || m.participationShift <= -R.participationShift;
  const extended = m.relative30d >= R.extendedRelative30d;
  const volumeSurge = m.medianVolumeChange !== null && m.medianVolumeChange >= R.volumeSurge;

  const outperform = `${m.outperformCount} of ${assetCount} assets outperformed BTC`;
  const deterioration = [
    m.momentumShift <= -R.momentumShift
      ? `relative momentum slowed from ${fmtPts(m.relativePrior7d)} to ${fmtPts(m.relative7d)} vs BTC week over week`
      : null,
    m.participationShift <= -R.participationShift
      ? `the share of assets beating BTC fell from ${fmtShare(m.priorOutperformShare)} to ${fmtShare(m.outperformShare)}`
      : null,
  ]
    .filter(Boolean)
    .join(" and ");

  if (strong && extended && (m.fundingElevated || volumeSurge)) {
    const crowding =
      m.fundingElevated && m.medianFunding8h !== null
        ? `median funding is ${fmtFunding(m.medianFunding8h)} per 8h`
        : `median volume is ${fmtPct(m.medianVolumeChange ?? 0)} vs the prior three weeks`;
    return {
      state: "CROWDED",
      reason: `Median 7-day return beat BTC by ${fmtPts(m.relative7d)} and ${outperform}, after a ${fmtPts(m.relative30d)} 30-day run; ${crowding}.`,
    };
  }
  if ((extended || strong) && deteriorating && !weak) {
    const elevated = extended ? `${fmtPts(m.relative30d)} vs BTC over 30 days` : `${fmtPts(m.relative7d)} vs BTC over 7 days`;
    return { state: "EXHAUSTING", reason: `Momentum is still elevated (${elevated}), but ${deterioration}.` };
  }
  if (strong) {
    return {
      state: "ACCELERATING",
      reason: `Median 7-day return beat BTC by ${fmtPts(m.relative7d)} and ${outperform}, with no deterioration in momentum or participation week over week.`,
    };
  }
  if (improving && !deteriorating && !extended && m.relative7d > 0 && m.outperformShare >= 0.5) {
    return {
      state: "EMERGING",
      reason: `Relative momentum improved (${fmtPts(m.relativePrior7d)} → ${fmtPts(m.relative7d)} vs BTC week over week) and ${outperform}, without a large 30-day run yet (${fmtPts(m.relative30d)}).`,
    };
  }
  if (weak || (m.relative7d < 0 && deteriorating && m.outperformShare < 0.5)) {
    return {
      state: "FADING",
      reason: weak
        ? `Median 7-day return trailed BTC by ${fmtPts(m.relative7d)} and only ${outperform}.`
        : `Median 7-day return is ${fmtPts(m.relative7d)} vs BTC and ${deterioration}.`,
    };
  }
  return {
    state: "STABLE",
    reason: `No lifecycle threshold was met: ${fmtPts(m.relative7d)} vs BTC over 7 days, ${outperform}, momentum shift ${fmtPts(m.momentumShift)} week over week.`,
  };
}

export function momentumGlyph(median7d: number): MomentumGlyph {
  if (median7d >= 10) return "+++";
  if (median7d >= 5) return "++";
  if (median7d >= 1.5) return "+";
  if (median7d > -1.5) return "·";
  if (median7d > -5) return "−";
  if (median7d > -10) return "−−";
  return "−−−";
}

const LEVELS: DataConfidence[] = ["HIGH", "MODERATE", "LOW"];

export function dataConfidence(m: NarrativeMetrics, coverage: NarrativeCoverage): { level: DataConfidence; reasons: string[] } {
  let level = coverage.level === "normal" ? 0 : 1;
  const reasons = [
    `${coverage.available} of ${coverage.configured} tracked assets returned usable data${coverage.level === "reduced" ? " (below 75%)" : ""}.`,
  ];
  const disagree = (m.relative7d > 0 && m.outperformShare < 0.5) || (m.relative7d < 0 && m.outperformShare > 0.5);
  if (disagree) {
    level += 1;
    reasons.push("The median return and the share of assets beating BTC point in different directions.");
  }
  if (m.concentrated && m.leader) {
    level += 1;
    reasons.push(`Gains are concentrated in ${m.leader.symbol}.`);
  }
  if (reasons.length === 1 && coverage.level === "normal") reasons.push("Median return and breadth agree.");
  return { level: LEVELS[Math.min(level, 2)], reasons };
}

// ─── Evidence lists ──────────────────────────────────────────────────────────

/** Deterministic facts, each tagged by whether it points to narrative strength or weakness. */
function evidenceFacts(m: NarrativeMetrics, assets: AssetReading[], benchmark: BenchmarkReading) {
  const k = assets.length;
  const strength: string[] = [];
  const weakness: string[] = [];
  const side = (isStrength: boolean, text: string) => (isStrength ? strength : weakness).push(text);

  side(
    m.relative7d >= 0,
    `Median 7-day return is ${fmtPct(m.median7d)} vs BTC ${fmtPct(benchmark.return7d)} (${fmtPts(m.relative7d)}).`,
  );
  if (m.outperformCount > 0) strength.push(`${m.outperformCount} of ${k} tracked assets outperformed BTC over 7 days.`);
  if (m.outperformCount < k) weakness.push(`${k - m.outperformCount} of ${k} tracked assets underperformed BTC over 7 days.`);
  if (m.positiveCount > 0 && m.breadth >= 0.5) strength.push(`${m.positiveCount} of ${k} tracked assets are up over 7 days.`);
  if (m.breadth < 0.5) weakness.push(`${k - m.positiveCount} of ${k} tracked assets are flat or down over 7 days.`);

  if (m.momentumShift >= RADAR_RULES.momentumShift) {
    strength.push(`Relative momentum improved week over week (${fmtPts(m.relativePrior7d)} → ${fmtPts(m.relative7d)} vs BTC).`);
  } else if (m.momentumShift <= -RADAR_RULES.momentumShift) {
    weakness.push(`Relative momentum slowed week over week (${fmtPts(m.relativePrior7d)} → ${fmtPts(m.relative7d)} vs BTC).`);
  }
  if (m.participationShift >= RADAR_RULES.participationShift) {
    strength.push(`The share of assets beating BTC rose from ${fmtShare(m.priorOutperformShare)} to ${fmtShare(m.outperformShare)}.`);
  } else if (m.participationShift <= -RADAR_RULES.participationShift) {
    weakness.push(`The share of assets beating BTC fell from ${fmtShare(m.priorOutperformShare)} to ${fmtShare(m.outperformShare)}.`);
  }

  if (m.volumeCount > 0 && m.medianVolumeChange !== null) {
    const rising = m.volumeRisingCount / m.volumeCount >= 0.5;
    side(
      rising,
      `Volume is rising in ${rising ? "" : "only "}${m.volumeRisingCount} of ${m.volumeCount} assets (median ${fmtPct(m.medianVolumeChange)} vs the prior three weeks).`,
    );
  }

  if (m.concentrated && m.leader) {
    weakness.push(
      `Gains are concentrated: ${m.leader.symbol} supplies ${fmtShare(m.leader.share)} of the combined positive 7-day returns.`,
    );
  } else if (m.positiveCount > 0 && m.positiveCount <= 2 && k >= 4) {
    const risers = assets.filter((a) => a.return7d > 0).map((a) => `${a.symbol} ${fmtPct(a.return7d)}`);
    weakness.push(`Participation is narrow: only ${risers.join(" and ")} ${risers.length === 1 ? "is" : "are"} up over 7 days.`);
  }

  side(m.relative30d >= 0, `30-day median return is ${fmtPct(m.median30d)} vs BTC ${fmtPct(benchmark.return30d)} (${fmtPts(m.relative30d)}).`);
  if (m.relative30d >= RADAR_RULES.extendedRelative30d) {
    weakness.push(`The basket is already ${fmtPts(m.relative30d)} ahead of BTC over 30 days, so much of the move has happened.`);
  }
  if (m.fundingElevated && m.medianFunding8h !== null) {
    weakness.push(
      `Median funding is ${fmtFunding(m.medianFunding8h)} per 8h across ${m.fundingCount} perpetuals, above the ${fmtFunding(RADAR_RULES.fundingElevated8h)} crowding threshold.`,
    );
  }
  return { strength, weakness };
}

const STRENGTH_STATES: ReadonlySet<NarrativeState> = new Set(["ACCELERATING", "EMERGING", "CROWDED"]);

// ─── Readings and snapshot ───────────────────────────────────────────────────

export function readNarrative(
  def: NarrativeDefinition,
  universe: MarketUniverse,
  benchmark: BenchmarkReading | null,
  benchmarkError: string | null,
  now: number,
): NarrativeReading {
  const assets: AssetReading[] = [];
  const unavailable: UnavailableAsset[] = [];
  const trends: number[][] = [];

  for (const symbol of def.assets) {
    const data = universe.candles[symbol];
    if (!data) {
      unavailable.push({ symbol, reason: "not collected" });
      continue;
    }
    if (!data.ok) {
      unavailable.push({ symbol, reason: data.reason });
      continue;
    }
    const read = readAssetCandles(data.candles, now);
    if (!read.ok) {
      unavailable.push({ symbol, reason: read.reason });
      continue;
    }
    const positioning = universe.positioning?.[symbol];
    assets.push({
      ...read.reading,
      symbol,
      relative7d: benchmark ? read.reading.return7d - benchmark.return7d : 0,
      funding8h: positioning?.funding8h ?? null,
      openInterestUsd: positioning?.openInterestUsd ?? null,
    });
    trends.push(read.trend);
  }
  assets.sort((a, b) => b.return7d - a.return7d);

  const coverage = coverageOf(assets.length, def.assets.length);
  const base = { id: def.id, name: def.name, description: def.description, configuredAssets: def.assets, assets, unavailable, coverage };
  const unclassified = (reason: string): NarrativeReading => ({
    ...base,
    metrics: null,
    lifecycle: null,
    lifecycleReason: reason,
    confidence: null,
    momentum: null,
    trend: [],
    confirming: [],
    notConfirming: [],
  });

  if (!benchmark) {
    return unclassified(`Insufficient market data to classify this narrative: the BTC benchmark is unavailable (${benchmarkError ?? "no data"}), so relative performance cannot be measured.`);
  }
  if (coverage.level === "insufficient") {
    return unclassified(
      `Insufficient market data to classify this narrative: only ${coverage.available} of ${coverage.configured} tracked assets returned usable data (at least 50% and 3 assets are required).`,
    );
  }

  const metrics = computeMetrics(assets, benchmark);
  const { state, reason } = classifyLifecycle(metrics, assets.length);
  const { strength, weakness } = evidenceFacts(metrics, assets, benchmark);
  const strengthReading = STRENGTH_STATES.has(state) || (state === "STABLE" && metrics.relative7d >= 0);
  const gaps = unavailable.length
    ? [`${unavailable.length} of ${def.assets.length} tracked assets had no usable data (${unavailable.map((u) => u.symbol).join(", ")}).`]
    : [];

  return {
    ...base,
    metrics,
    lifecycle: state,
    lifecycleReason: reason,
    confidence: dataConfidence(metrics, coverage),
    momentum: momentumGlyph(metrics.median7d),
    trend: trends[0].map((_, i) => median(trends.map((t) => t[i])) ?? 1),
    confirming: strengthReading ? strength : weakness,
    notConfirming: [...(strengthReading ? weakness : strength), ...gaps],
  };
}

/** Where to look first: lifecycle priority, then the size of the relative move. Unclassified last. */
export function rankNarratives(readings: NarrativeReading[]): NarrativeReading[] {
  const priority = (r: NarrativeReading) => (r.lifecycle ? NARRATIVE_STATE_ORDER.indexOf(r.lifecycle) : NARRATIVE_STATE_ORDER.length);
  return [...readings].sort(
    (a, b) => priority(a) - priority(b) || Math.abs(b.metrics?.relative7d ?? 0) - Math.abs(a.metrics?.relative7d ?? 0),
  );
}

export function buildRadarSnapshot(
  universe: MarketUniverse,
  options: { mode: DataMode; now: number; narratives?: NarrativeDefinition[] },
): RadarSnapshot {
  const narratives = options.narratives ?? NARRATIVES;
  const { benchmark, error } = readBenchmark(universe, options.now);
  const readings = narratives.map((def) => readNarrative(def, universe, benchmark, error, options.now));

  const unique = new Map<string, boolean>();
  for (const r of readings) {
    for (const a of r.assets) unique.set(a.symbol, true);
    for (const u of r.unavailable) if (!unique.has(u.symbol)) unique.set(u.symbol, false);
  }
  const latest = readings.flatMap((r) => r.assets.map((a) => Date.parse(a.lastCandleAt)));

  return {
    mode: options.mode,
    generatedAt: universe.fetchedAt,
    dataAsOf: latest.length ? new Date(Math.max(...latest)).toISOString() : null,
    benchmark,
    benchmarkError: error,
    narratives: rankNarratives(readings),
    assetsAvailable: [...unique.values()].filter(Boolean).length,
    assetsConfigured: unique.size,
    positioningNote: universe.positioningNote,
  };
}

/** Editable starting theses for the KillMyThesis handoff. Deterministic, framed as claims to test. */
export function startingTheses(reading: Pick<NarrativeReading, "name" | "lifecycle">): { form: string; kill: string } {
  const { name, lifecycle } = reading;
  switch (lifecycle) {
    case "FADING":
      return {
        form: `I think the ${name} narrative is losing momentum and will keep underperforming the market.`,
        kill: `I think the ${name} weakness is temporary and the narrative will recover.`,
      };
    case "EXHAUSTING":
    case "CROWDED":
      return {
        form: `I think the ${name} narrative is overextended and its outperformance is running out.`,
        kill: `I think the ${name} rotation still has further upside despite heavy positioning.`,
      };
    case "STABLE":
    case null:
      return {
        form: `I think the ${name} narrative is about to start outperforming the market.`,
        kill: `I think the ${name} narrative will break out of its range and lead the market.`,
      };
    default:
      return {
        form: `I think the ${name} narrative has further to run.`,
        kill: `I think the current ${name} rotation has further upside.`,
      };
  }
}
