/**
 * NARRATIVE → THESIS CONTEXT.
 *
 * When a thesis is launched from Narrative Radar, the client sends only the narrative
 * id. The server resolves the context itself from the taxonomy and the cached radar
 * snapshot, so the context is always real data and never client-supplied numbers.
 * It is used three ways: structured context for the thesis parser (kept separate from
 * the thesis text), the research basket, and deterministic radar findings.
 */
import { NARRATIVE_STATE_META } from "@/lib/labels";
import { fmtFunding, fmtPct, fmtPts, fmtShare } from "@/lib/radar/engine";
import { getNarrativeDefinition, type NarrativeDefinition } from "@/lib/radar/taxonomy";
import type { BenchmarkReading, NarrativeReading, RadarSnapshot } from "@/lib/radar/types";
import type { ResearchOrigin } from "@/lib/types";
import type { RawFinding } from "@/server/research/types";

/** A narrative basket for research can be larger than a parser-chosen basket. */
export const MAX_NARRATIVE_SYMBOLS = 8;

export interface NarrativeResearchContext {
  definition: NarrativeDefinition;
  /** null when the radar snapshot could not be loaded. */
  reading: NarrativeReading | null;
  benchmark: BenchmarkReading | null;
  snapshotAt: string | null;
  dataAsOf: string | null;
}

export async function resolveNarrativeContext(
  narrativeId: string,
  loadSnapshot?: () => Promise<RadarSnapshot>,
): Promise<NarrativeResearchContext | null> {
  const definition = getNarrativeDefinition(narrativeId);
  if (!definition) return null;
  let snapshot: RadarSnapshot | null = null;
  try {
    snapshot = loadSnapshot ? await loadSnapshot() : null;
  } catch (err) {
    console.error("[research] radar snapshot unavailable for narrative context", err);
  }
  return {
    definition,
    reading: snapshot?.narratives.find((n) => n.id === narrativeId) ?? null,
    benchmark: snapshot?.benchmark ?? null,
    snapshotAt: snapshot?.generatedAt ?? null,
    dataAsOf: snapshot?.dataAsOf ?? null,
  };
}

/** Assets with usable radar data, in taxonomy order; the full configured basket if the radar was unavailable. */
export function narrativeSymbols(ctx: NarrativeResearchContext): string[] {
  const available = ctx.reading ? new Set(ctx.reading.assets.map((a) => a.symbol)) : null;
  const symbols = available ? ctx.definition.assets.filter((s) => available.has(s)) : ctx.definition.assets;
  return (symbols.length ? symbols : ctx.definition.assets).slice(0, MAX_NARRATIVE_SYMBOLS);
}

/** Compact structured context for the thesis parser. Not concatenated into the thesis text. */
export function parserContext(ctx: NarrativeResearchContext) {
  const m = ctx.reading?.metrics;
  return {
    narrative: ctx.definition.name,
    description: ctx.definition.description,
    representativeAssets: narrativeSymbols(ctx),
    lifecycle: ctx.reading?.lifecycle ? NARRATIVE_STATE_META[ctx.reading.lifecycle].label : "not classified",
    radarMetrics:
      m && ctx.reading
        ? {
            median7dReturn: fmtPct(m.median7d),
            relative7dVsBtc: fmtPts(m.relative7d),
            assetsOutperformingBtc: `${m.outperformCount} of ${ctx.reading.assets.length}`,
            relative30dVsBtc: fmtPts(m.relative30d),
          }
        : null,
  };
}

export function originOf(ctx: NarrativeResearchContext): ResearchOrigin {
  return {
    kind: "narrative",
    narrativeId: ctx.definition.id,
    narrativeName: ctx.definition.name,
    lifecycle: ctx.reading?.lifecycle ?? null,
    assets: narrativeSymbols(ctx),
    snapshotAt: ctx.snapshotAt,
  };
}

/** Deterministic market-structure findings from the radar reading. Empty when it was not classified. */
export function narrativeFindings(ctx: NarrativeResearchContext): RawFinding[] {
  const { reading, benchmark } = ctx;
  const m = reading?.metrics;
  if (!reading || !m || !benchmark || !reading.lifecycle) return [];
  const k = reading.assets.length;
  const source = `KillMyThesis Narrative Radar · Bitget daily spot candles (${reading.assets.map((a) => a.symbol).join(", ")})`;

  const participation = [
    m.medianVolumeChange !== null
      ? `median volume change ${fmtPct(m.medianVolumeChange)} (last 7 complete days vs the prior 21), rising in ${m.volumeRisingCount} of ${m.volumeCount} assets`
      : "volume change unavailable",
    `relative momentum shift ${fmtPts(m.momentumShift)} week over week`,
    m.leader ? `largest contributor ${m.leader.symbol} supplies ${fmtShare(m.leader.share)} of the combined positive 7-day returns` : null,
    m.medianFunding8h !== null
      ? `median funding ${fmtFunding(m.medianFunding8h)} per 8h across ${m.fundingCount} perpetuals`
      : "funding unavailable",
  ].filter(Boolean);

  return [
    {
      id: "radar-reading",
      dimension: "market_structure",
      source,
      topic: "Narrative Radar reading",
      observation: `Narrative Radar classified ${reading.name} as ${NARRATIVE_STATE_META[reading.lifecycle].label.toUpperCase()} using ${k} of ${reading.coverage.configured} tracked assets: median 7-day return ${fmtPct(m.median7d)} vs BTC ${fmtPct(benchmark.return7d)} (${fmtPts(m.relative7d)}); ${m.outperformCount} of ${k} assets outperformed BTC and ${m.positiveCount} of ${k} are up over 7 days; median 30-day return ${fmtPct(m.median30d)} vs BTC ${fmtPct(benchmark.return30d)}.`,
      timestamp: ctx.dataAsOf,
      rawValue: { lifecycle: reading.lifecycle, metrics: m, benchmark },
    },
    {
      id: "radar-participation",
      dimension: "market_structure",
      source,
      topic: "Narrative participation & positioning",
      observation: `${reading.name} basket: ${participation.join("; ")}.`,
      timestamp: ctx.dataAsOf,
      rawValue: { volume: m.medianVolumeChange, leader: m.leader, funding8h: m.medianFunding8h },
    },
  ];
}
