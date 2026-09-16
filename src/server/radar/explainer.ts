/**
 * NARRATIVE EXPLANATION (LLM interprets, code owns the facts).
 *
 * The model receives the deterministic reading as pre-formatted facts and explains it:
 * why the narrative is classified this way, the strongest evidence, what weakens it,
 * and what to investigate next. It cannot change the lifecycle, the numbers or the
 * confidence, and it is never called for narratives that could not be classified.
 *
 * Output is validated before it is shown:
 *   - every number must appear in the supplied facts (allowing rounding)
 *   - no ticker from another narrative basket may be mentioned
 *   - no claim of a different lifecycle stage ("is fading" for an accelerating narrative)
 *   - no trade instruction
 * A failing bullet is dropped; a failing summary rejects the whole explanation.
 */
import { z } from "zod";
import { NARRATIVE_STATE_META } from "@/lib/labels";
import { RADAR_RULES, fmtFunding, fmtPct, fmtPts, fmtShare, fmtUsd } from "@/lib/radar/engine";
import { BENCHMARK_SYMBOL, universeSymbols } from "@/lib/radar/taxonomy";
import type { NarrativeExplanation, NarrativeReading, RadarSnapshot } from "@/lib/radar/types";
import { allowedNumbers, ungroundedNumbers } from "@/server/llm/grounding";
import { LlmConfigError, LlmOutputError, createDefaultLlm, type StructuredLlm } from "@/server/llm/structured";
import { containsTradeInstruction } from "@/server/research/synthesizer";

export const ExplanationOutput = z.object({
  summary: z.string(),
  strongestEvidence: z.array(z.string()),
  weakeningEvidence: z.array(z.string()),
  investigateNext: z.array(z.string()),
});
export type ExplanationOutput = z.infer<typeof ExplanationOutput>;

export type ExplanationResult =
  | { ok: true; explanation: NarrativeExplanation; removed: number }
  | { ok: false; reason: "insufficient_data" | "not_configured" | "rejected" | "failed"; message: string };

const MAX_ITEMS = 4;

const SYSTEM = `You explain Narrative Radar readings for KillMyThesis, a crypto research desk.

A narrative's lifecycle, metrics and data confidence were already calculated deterministically from Bitget market data. Treat them as fixed facts. Your job is to interpret them for a trader.

Write:
- summary: 2-4 sentences on why the narrative has this lifecycle classification, citing the specific metrics that drove it.
- strongestEvidence: 1-${MAX_ITEMS} short points, the facts that most support the classification.
- weakeningEvidence: 1-${MAX_ITEMS} short points, the facts that weaken or contradict it (breadth gaps, concentration, slowing momentum, volume, positioning, missing data).
- investigateNext: 1-${MAX_ITEMS} concrete things a trader should check next, phrased as research questions or checks.

Rules:
- Use only the facts provided. Every number you write must come from them. Never invent prices, returns, volumes, news, events, catalysts, adoption stories or citations.
- Refer only to assets listed in the facts.
- Do not change or dispute the lifecycle stage and do not produce a score.
- News, social sentiment and on-chain data were not part of this reading; do not describe them.
- A lifecycle stage is a description, not a prediction. Never say what price will do.
- This is research, not advice. Never tell the reader to buy, sell, go long, go short, enter or exit a position.
- Avoid generic sector commentary ("AI is a growing sector"). Explain the observed market behavior.`;

/** Pre-formatted, deterministic facts. Every number the model may use appears here. */
export function narrativeFacts(reading: NarrativeReading, snapshot: RadarSnapshot) {
  const m = reading.metrics;
  const b = snapshot.benchmark;
  if (!m || !b || !reading.lifecycle || !reading.confidence) return null;
  const k = reading.assets.length;
  return {
    narrative: reading.name,
    description: reading.description,
    lifecycle: NARRATIVE_STATE_META[reading.lifecycle].label.toUpperCase(),
    lifecycleRule: reading.lifecycleReason,
    dataConfidence: reading.confidence.level,
    dataConfidenceReasons: reading.confidence.reasons,
    benchmark: BENCHMARK_SYMBOL,
    coverage: `${reading.coverage.available} of ${reading.coverage.configured} tracked assets available (${fmtShare(reading.coverage.share)})`,
    unavailableAssets: reading.unavailable.map((u) => `${u.symbol}: ${u.reason}`),
    metrics: {
      "Median 7-day return": fmtPct(m.median7d),
      "BTC 7-day return": fmtPct(b.return7d),
      "Relative 7-day performance vs BTC": fmtPts(m.relative7d),
      "Relative performance vs BTC in the prior week": fmtPts(m.relativePrior7d),
      "Momentum shift week over week": fmtPts(m.momentumShift),
      "Assets up over 7 days": `${m.positiveCount} of ${k} (${fmtShare(m.breadth)})`,
      "Assets outperforming BTC over 7 days": `${m.outperformCount} of ${k} (${fmtShare(m.outperformShare)})`,
      "Share outperforming BTC in the prior week": fmtShare(m.priorOutperformShare),
      "Median 30-day return": fmtPct(m.median30d),
      "BTC 30-day return": fmtPct(b.return30d),
      "Relative 30-day performance vs BTC": fmtPts(m.relative30d),
      "Median volume change (last 7 complete days vs prior 21)":
        m.medianVolumeChange === null ? "unavailable" : fmtPct(m.medianVolumeChange),
      "Assets with rising volume": `${m.volumeRisingCount} of ${m.volumeCount}`,
      "Largest contributor to positive returns": m.leader ? `${m.leader.symbol} (${fmtShare(m.leader.share)})` : "none",
      "Median funding per 8h": m.medianFunding8h === null ? "unavailable" : fmtFunding(m.medianFunding8h),
      "Perpetuals with funding data": `${m.fundingCount} of ${k}`,
      "Total open interest": m.openInterestUsd === null ? "unavailable" : fmtUsd(m.openInterestUsd),
    },
    assets: reading.assets.map((a) => ({
      symbol: a.symbol,
      "7d return": fmtPct(a.return7d),
      "7d vs BTC": fmtPts(a.relative7d),
      "30d return": fmtPct(a.return30d),
      "volume change": a.volumeChange === null ? "unavailable" : fmtPct(a.volumeChange),
      "funding per 8h": a.funding8h === null ? "unavailable" : fmtFunding(a.funding8h),
    })),
    confirmingEvidence: reading.confirming,
    notConfirmingEvidence: reading.notConfirming,
    classificationThresholds: {
      "strong relative 7-day performance": fmtPts(RADAR_RULES.strongRelative7d),
      "strong participation": fmtShare(RADAR_RULES.strongParticipation),
      "extended 30-day run": fmtPts(RADAR_RULES.extendedRelative30d),
      "volume surge": fmtPct(RADAR_RULES.volumeSurge),
      "elevated funding per 8h": fmtFunding(RADAR_RULES.fundingElevated8h),
    },
    positioningNote: snapshot.positioningNote,
    notCovered: "News, social sentiment and on-chain data are not part of this classification.",
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

export { allowedNumbers, ungroundedNumbers };

const STAGE_CLAIM = /\b(?:is|remains|now|as)\s+(?:an?\s+)?(emerging|accelerating|crowded|exhausting|fading|stable)\b/gi;
const ALL_SYMBOLS = new Set(universeSymbols());

export function statementProblem(text: string, reading: NarrativeReading, allowed: number[]): string | null {
  const numbers = ungroundedNumbers(text, allowed);
  if (numbers.length) return `figures not in the data (${numbers.join(", ")})`;
  const own = new Set([...reading.configuredAssets, BENCHMARK_SYMBOL]);
  const foreign = (text.match(/\b[A-Z][A-Z0-9]{1,9}\b/g) ?? []).filter((t) => ALL_SYMBOLS.has(t) && !own.has(t));
  if (foreign.length) return `assets outside this narrative (${[...new Set(foreign)].join(", ")})`;
  const stage = reading.lifecycle?.toLowerCase();
  for (const match of text.matchAll(STAGE_CLAIM)) {
    if (match[1].toLowerCase() !== stage) return `a different lifecycle stage (${match[1]})`;
  }
  if (containsTradeInstruction(text)) return "a trade instruction";
  return null;
}

export function validateExplanation(
  output: ExplanationOutput,
  reading: NarrativeReading,
  facts: object,
): { ok: true; explanation: NarrativeExplanation; removed: number } | { ok: false; message: string } {
  const allowed = allowedNumbers(facts);
  const summary = output.summary.trim();
  if (!summary) return { ok: false, message: "The AI explanation was empty." };
  const summaryProblem = statementProblem(summary, reading, allowed);
  if (summaryProblem) {
    return { ok: false, message: `The AI explanation was not shown because it referenced ${summaryProblem}.` };
  }

  let removed = 0;
  const clean = (items: string[]) =>
    items
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => {
        const bad = statementProblem(s, reading, allowed) !== null;
        if (bad) removed += 1;
        return !bad;
      })
      .slice(0, MAX_ITEMS);

  return {
    ok: true,
    explanation: {
      summary,
      strongestEvidence: clean(output.strongestEvidence),
      weakeningEvidence: clean(output.weakeningEvidence),
      investigateNext: clean(output.investigateNext),
    },
    removed,
  };
}

// ─── Generation ──────────────────────────────────────────────────────────────

export async function explainNarrative(
  reading: NarrativeReading,
  snapshot: RadarSnapshot,
  makeLlm: () => StructuredLlm = createDefaultLlm,
  signal?: AbortSignal,
): Promise<ExplanationResult> {
  const facts = narrativeFacts(reading, snapshot);
  if (!facts) {
    return { ok: false, reason: "insufficient_data", message: "No explanation: this narrative could not be classified." };
  }
  try {
    const llm = makeLlm();
    const output = await llm(
      { name: "Narrative explainer", system: SYSTEM, prompt: JSON.stringify(facts, null, 1), schema: ExplanationOutput },
      signal,
    );
    const validated = validateExplanation(output, reading, facts);
    return validated.ok ? validated : { ok: false, reason: "rejected", message: validated.message };
  } catch (err) {
    if (err instanceof LlmConfigError) {
      return { ok: false, reason: "not_configured", message: `AI explanation unavailable: ${err.message}` };
    }
    if (err instanceof LlmOutputError) return { ok: false, reason: "failed", message: `AI explanation unavailable: ${err.message}` };
    console.error("[radar] explanation failed", err);
    return { ok: false, reason: "failed", message: "AI explanation unavailable: the request failed." };
  }
}

// One explanation per narrative per market-data snapshot. Failures are not cached.
const store = globalThis as typeof globalThis & { __kmtRadarExplanations?: Map<string, Promise<ExplanationResult>> };

export function getNarrativeExplanation(reading: NarrativeReading, snapshot: RadarSnapshot): Promise<ExplanationResult> {
  const cache = (store.__kmtRadarExplanations ??= new Map());
  const key = `${reading.id}:${snapshot.generatedAt}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = explainNarrative(reading, snapshot).then((result) => {
    if (!result.ok) cache.delete(key);
    return result;
  });
  if (cache.size > 100) cache.clear();
  cache.set(key, pending);
  return pending;
}
