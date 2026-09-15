/**
 * SAMPLE FIXTURES — Phase 1 interface development only.
 *
 * These contain NO market data. Findings are qualitative placeholders, sources
 * are labeled "Sample", and timestamps are null. Every screen that renders them
 * shows a SAMPLE DATA notice, and they are never written to research history.
 * Scores and verdicts are still computed by the real scoring engine.
 *
 * Remove this folder once the live pipeline replaces it (Phase 5).
 */
import { DIMENSION_ORDER, DIMENSIONS } from "@/lib/dimensions";
import { evaluateThesis } from "@/lib/scoring";
import type { DimensionId, Evidence, ParsedThesis, ResearchBrief, SourceCheck } from "@/lib/types";

const sampleSource = (dimension: DimensionId) => `Sample · ${DIMENSIONS[dimension].provider}`;

// ─── Thesis brief ────────────────────────────────────────────────────────────

export const SAMPLE_THESIS: ParsedThesis = {
  raw: "I'm thinking about going long SOL because ecosystem activity is getting stronger and this pullback looks temporary.",
  subject: "SOL",
  stance: "LONG",
  coreThesis: "Solana ecosystem activity is strengthening and the current pullback is temporary.",
  horizon: null,
  assumptions: [
    { id: "A1", text: "Ecosystem activity is strengthening.", kind: "adoption" },
    { id: "A2", text: "The recent price decline is a temporary pullback rather than a trend reversal.", kind: "price_action" },
    { id: "A3", text: "The market has not fully priced in the fundamental strength.", kind: "valuation" },
  ],
};

/** Macro is deliberately shown as unavailable so the failure state is always visible in preview. */
export const SAMPLE_SOURCES: SourceCheck[] = DIMENSION_ORDER.map((dimension) =>
  dimension === "macro" ? { dimension, status: "unavailable", note: "unavailable" } : { dimension, status: "ok" },
);

const ev = (e: Omit<Evidence, "source" | "timestamp">): Evidence => ({
  ...e,
  source: sampleSource(e.dimension),
  timestamp: null,
});

export const SAMPLE_EVIDENCE: Evidence[] = [
  ev({
    id: "E1",
    dimension: "onchain",
    topic: "DeFi activity",
    finding: "Chain-level DeFi value locked is trending up over the sample window.",
    direction: "supporting",
    confidence: 0.7,
    relevance: 0.8,
    explanation: "Capital staying and growing inside the ecosystem is direct support for the claim that activity is strengthening.",
    assumptionIds: ["A1"],
  }),
  ev({
    id: "E2",
    dimension: "onchain",
    topic: "Activity concentration",
    finding: "Growth is concentrated in a small number of protocols.",
    direction: "challenging",
    confidence: 0.6,
    relevance: 0.7,
    explanation: "Narrow growth is more fragile than broad adoption. If a few apps drive the numbers, A1 holds less firmly.",
    assumptionIds: ["A1"],
  }),
  ev({
    id: "E3",
    dimension: "news",
    topic: "Ecosystem news flow",
    finding: "Recent coverage skews toward launches and integrations.",
    direction: "supporting",
    confidence: 0.5,
    relevance: 0.5,
    explanation: "Positive development news fits the activity narrative, but it is not usage data and is weighted lightly.",
    assumptionIds: ["A1"],
  }),
  ev({
    id: "E4",
    dimension: "technical",
    topic: "Trend",
    finding: "Price is trading below its medium-term trend average on the daily timeframe.",
    direction: "challenging",
    confidence: 0.7,
    relevance: 0.9,
    explanation: "Pullbacks inside an uptrend usually hold the medium-term average. Losing it raises the odds that the trend is changing.",
    assumptionIds: ["A2"],
  }),
  ev({
    id: "E5",
    dimension: "technical",
    topic: "Momentum",
    finding: "Daily momentum is recovering from oversold territory.",
    direction: "supporting",
    confidence: 0.55,
    relevance: 0.7,
    explanation: "Recovering momentum is consistent with a pullback ending, although it has not confirmed yet.",
    assumptionIds: ["A2"],
  }),
  ev({
    id: "E6",
    dimension: "market_structure",
    topic: "Volume",
    finding: "Spot volume during the decline ran below its recent average.",
    direction: "neutral",
    confidence: 0.5,
    relevance: 0.5,
    explanation: "Low-volume declines are often less decisive, but volume alone cannot separate a pause from a reversal.",
    assumptionIds: ["A2"],
  }),
  ev({
    id: "E7",
    dimension: "positioning",
    topic: "Funding & long/short",
    finding: "Funding is positive and the long/short ratio leans long.",
    direction: "challenging",
    confidence: 0.65,
    relevance: 0.8,
    explanation: "If traders are already long, part of the story is likely priced in, and crowded longs add downside risk.",
    assumptionIds: ["A3"],
  }),
  ev({
    id: "E8",
    dimension: "sentiment",
    topic: "Market mood",
    finding: "The market-wide sentiment index sits in greed territory.",
    direction: "challenging",
    confidence: 0.5,
    relevance: 0.6,
    explanation: "Elevated optimism makes it harder to argue that strength is still unrecognized.",
    assumptionIds: ["A3"],
  }),
  ev({
    id: "E9",
    dimension: "positioning",
    topic: "Open interest",
    finding: "Open interest fell during the pullback.",
    direction: "supporting",
    confidence: 0.6,
    relevance: 0.7,
    explanation: "Leverage clearing out during a decline looks more like a reset than the start of a sustained sell-off.",
    assumptionIds: ["A2"],
  }),
  ev({
    id: "E10",
    dimension: "onchain",
    topic: "Price vs. activity",
    finding: "Price performance has lagged the ecosystem activity trend.",
    direction: "supporting",
    confidence: 0.5,
    relevance: 0.7,
    explanation: "A gap between usage and price is the core of A3: it suggests the strength is not fully reflected yet.",
    assumptionIds: ["A3"],
  }),
];

const SAMPLE_REASONING: Record<string, string> = {
  A1: "Activity is growing, but concentration in a few protocols keeps this from being a clean pass.",
  A2: "Leverage reset and momentum recovery support a pullback, but losing the medium-term trend is a serious counterpoint.",
  A3: "Price lagging activity helps, but long-leaning positioning and greedy sentiment suggest much is already priced in.",
};

export function buildSampleBrief(): ResearchBrief {
  const { assumptions, score, verdict } = evaluateThesis(SAMPLE_THESIS, SAMPLE_EVIDENCE, SAMPLE_SOURCES);
  return {
    id: "sample-sol-long",
    createdAt: new Date().toISOString(),
    mode: "sample",
    thesis: SAMPLE_THESIS,
    sources: SAMPLE_SOURCES,
    evidence: SAMPLE_EVIDENCE,
    assumptions: assumptions.map((a) => ({ ...a, reasoning: SAMPLE_REASONING[a.assumptionId] ?? "" })),
    score,
    verdict,
    verdictSummary:
      "The fundamental part of your thesis holds up, but the price-action and “not priced in” assumptions are weaker than they first appear.",
    invalidation: [
      { condition: "Chain-level activity rolls over while price is still weak.", dimension: "onchain" },
      { condition: "Daily closes stay below the medium-term trend average and the average turns down.", dimension: "technical" },
      { condition: "Funding stays elevated while price fails to make progress, a sign of crowded longs.", dimension: "positioning" },
      { condition: "The pullback low breaks on rising volume.", dimension: "market_structure" },
    ],
    conclusion: {
      strongestFor: "Ecosystem activity points in the thesis’s direction, and leverage cleared out during the decline rather than building.",
      strongestAgainst: "Price has lost its medium-term trend and positioning already leans long. “Not priced in” is the weakest link.",
      summary:
        "After looking for reasons this trade could be wrong: the fundamental leg of the thesis partly holds, but the timing leg has no market confirmation yet. The thesis is only as strong as assumptions 02 and 03, and that is where the evidence is thinnest.",
    },
  };
}

