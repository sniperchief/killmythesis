import { describe, expect, it } from "vitest";
import { evaluateThesis } from "@/lib/scoring";
import type { Evidence, ParsedThesis, SourceCheck } from "@/lib/types";
import { LlmOutputError } from "@/server/llm/structured";
import { measurableSignals } from "./signals";
import { containsTradeInstruction, interpretSynthesis, type SynthesisContext, type SynthesisOutput } from "./synthesizer";
import type { RawFinding } from "./types";

const thesis: ParsedThesis = {
  raw: "Long SOL because ecosystem activity is strengthening and the trend is intact.",
  subject: "SOL",
  stance: "LONG",
  coreThesis: "Solana activity is strengthening and the uptrend is intact.",
  horizon: null,
  assumptions: [
    { id: "A1", text: "Solana ecosystem activity is strengthening.", kind: "adoption" },
    { id: "A2", text: "The SOL uptrend is intact.", kind: "price_action" },
  ],
};

const findings: RawFinding[] = [
  {
    id: "chain-tvl-trend",
    dimension: "onchain",
    source: "DeFiLlama · Solana TVL history",
    topic: "DeFi TVL trend",
    observation: "Solana DeFi TVL changed +10.0% over 30 days ($5.00B → $5.50B).",
    timestamp: "2026-09-15T00:00:00.000Z",
    rawValue: { last: { date: 1, tvl: 5.5e9 }, weekAgo: { date: 0, tvl: 5.4e9 }, monthAgo: { date: 0, tvl: 5e9 } },
  },
  {
    id: "pos-funding-now",
    dimension: "positioning",
    source: "Bitget Market API · SOLUSDT USDT perpetual ticker",
    topic: "Funding & open interest",
    observation: "SOLUSDT perpetual funding rate is 0.0100% per settlement.",
    timestamp: "2026-09-15T00:00:00.000Z",
    rawValue: { fundingRate: 0.0001, openInterest: 4e6, markPrice: 150 },
  },
  {
    id: "ta-trend",
    dimension: "technical",
    source: "Bitget Market API · SOLUSDT spot candles, indicators computed locally",
    topic: "Trend (moving averages)",
    observation: "SOL last close 150.00 is +4.9% vs its 20-day SMA (143.00) and +7.9% vs its 50-day SMA (139.00).",
    timestamp: "2026-09-15T00:00:00.000Z",
    rawValue: { close: 150, sma20: 143, sma50: 139 },
  },
];

const ev = (findingId: string, direction: Evidence["direction"], weight: number, assumptionIds: string[]): Evidence => {
  const f = findings.find((x) => x.id === findingId)!;
  return {
    id: `${findingId}-${direction.slice(0, 3)}`,
    findingId,
    source: f.source,
    dimension: f.dimension,
    topic: f.topic,
    finding: f.observation,
    direction,
    confidence: weight,
    relevance: weight,
    timestamp: f.timestamp,
    explanation: `Why ${findingId} matters.`,
    assumptionIds,
  };
};

const evidence: Evidence[] = [
  ev("chain-tvl-trend", "supporting", 0.9, ["A1"]),
  ev("pos-funding-now", "challenging", 0.6, ["A1"]),
  ev("ta-trend", "supporting", 0.95, ["A2"]),
];

const sources: SourceCheck[] = [
  { dimension: "technical", status: "ok" },
  { dimension: "positioning", status: "ok" },
  { dimension: "news", status: "unavailable", note: "unavailable · timeout" },
  { dimension: "onchain", status: "ok" },
];

const context = (overrides: Partial<SynthesisContext> = {}): SynthesisContext => ({
  thesis,
  evidence,
  evaluation: evaluateThesis(thesis, evidence, sources),
  sources,
  signals: measurableSignals(findings, thesis.stance, "SOL"),
  coverage: "Research was completed using 3 of 4 planned dimensions.",
  ...overrides,
});

const base: SynthesisOutput = {
  verdictSummary: "Partially supported by the available data.",
  assumptionReasoning: [
    { assumptionId: "A1", reasoning: "Mixed." },
    { assumptionId: "A9", reasoning: "ignored" },
  ],
  invalidation: [
    {
      thresholdIds: ["ta-trend:below:139", "pos-funding-now:below:0"],
      assumptionIds: ["A2", "A9"],
      rationale: "Losing the 50-day average while funding turns negative would mean both price and positioning have turned.",
    },
  ],
  conclusion: { strongestFor: "TVL rising.", strongestAgainst: "Funding positive.", summary: "Summary." },
};

describe("synthesis guards", () => {
  it("detects trade instructions without flagging market vocabulary", () => {
    expect(containsTradeInstruction("You should buy SOL here.")).toBe(true);
    expect(containsTradeInstruction("We recommend taking a position.")).toBe(true);
    expect(containsTradeInstruction("Consider a stop-loss at 95.")).toBe(true);
    expect(containsTradeInstruction("Taker buy volume was 0.87× taker sell volume.")).toBe(false);
    expect(containsTradeInstruction("Long positioning is crowded and buy pressure faded.")).toBe(false);
  });

  it("refuses to publish a brief that tells the trader what to do", () => {
    expect(() =>
      interpretSynthesis(context(), { ...base, conclusion: { ...base.conclusion, summary: "Traders should buy the dip." } }),
    ).toThrow(LlmOutputError);
  });

  it("keeps reasoning only for real assumptions", () => {
    expect(interpretSynthesis(context(), base).reasoningByAssumption).toEqual({ A1: "Mixed." });
  });
});

describe("measurable invalidation", () => {
  it("renders conditions from offered thresholds only, with values from the data", () => {
    const { invalidation } = interpretSynthesis(context(), {
      ...base,
      invalidation: [
        ...base.invalidation,
        // Agrees with a LONG thesis, so it was never offered.
        { thresholdIds: ["ta-trend:above:139"], assumptionIds: ["A2"], rationale: "" },
        // Invented by the model.
        { thresholdIds: ["sol-price:below:120"], assumptionIds: ["A2"], rationale: "" },
      ],
    });
    expect(invalidation).toEqual([
      {
        condition:
          "The thesis is weakened if SOL daily close falls below the 50-day SMA (139.00) (now 150.00) while SOL perpetual funding rate falls below 0% (now 0.0100%).",
        dimension: "technical",
        signals: [
          { findingId: "ta-trend", label: "SOL daily close", current: "150.00", comparator: "below", threshold: "the 50-day SMA (139.00)" },
          { findingId: "pos-funding-now", label: "SOL perpetual funding rate", current: "0.0100%", comparator: "below", threshold: "0%" },
        ],
        assumptionIds: ["A2"],
        rationale: base.invalidation[0].rationale,
      },
    ]);
  });

  it("drops a rationale that cites numbers not in the data, keeping the condition", () => {
    const [condition] = interpretSynthesis(context(), {
      ...base,
      // 37 appears nowhere in the facts (the score components here are 83, 72, 12, 25 and 72).
      invalidation: [{ ...base.invalidation[0], rationale: "A 37% drop would confirm a breakdown." }],
    }).invalidation;
    expect(condition.condition).toContain("falls below the 50-day SMA (139.00)");
    expect(condition.rationale).toBeUndefined();
  });

  it("falls back to deterministic conditions built from the strongest supporting evidence", () => {
    const { invalidation } = interpretSynthesis(context(), { ...base, invalidation: [] });
    expect(invalidation.map((c) => c.condition)).toEqual([
      "The thesis is weakened if SOL daily close falls below the 50-day SMA (139.00) (now 150.00).",
      "The thesis is weakened if SOL chain DeFi TVL, 30-day change falls below 0% (now +10.0%).",
    ]);
    expect(invalidation.every((c) => c.rationale === undefined)).toBe(true);
  });

  it("sets no invalidation, instead of inventing one, when no metric returned data", () => {
    expect(interpretSynthesis(context({ signals: [] }), { ...base, invalidation: [] }).invalidation).toEqual([]);
  });

  it("only uses numbers that appear in the data or the metric's neutral line", () => {
    const [condition] = interpretSynthesis(context(), base).invalidation;
    const grounded = new Set(["139.00", "150.00", "0", "0.0100", "50"]);
    for (const n of condition.condition.match(/\d+(?:\.\d+)?/g) ?? []) expect(grounded).toContain(n);
  });
});
