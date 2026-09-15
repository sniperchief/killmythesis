import { describe, expect, it } from "vitest";
import type { ParsedThesis } from "@/lib/types";
import { LlmOutputError } from "@/server/llm/structured";
import { containsTradeInstruction, interpretSynthesis, type SynthesisOutput } from "./synthesizer";

const thesis: ParsedThesis = {
  raw: "raw",
  subject: "SOL",
  stance: "LONG",
  coreThesis: "core",
  horizon: null,
  assumptions: [{ id: "A1", text: "Activity is strengthening.", kind: "adoption" }],
};

const base: SynthesisOutput = {
  verdictSummary: "Partially supported by the available data.",
  assumptionReasoning: [{ assumptionId: "A1", reasoning: "Mixed." }, { assumptionId: "A9", reasoning: "ignored" }],
  invalidation: [{ condition: "Chain TVL falls below its 30-day low while price weakens.", dimension: "onchain" }],
  conclusion: { strongestFor: "TVL rising.", strongestAgainst: "Funding crowded.", summary: "Summary." },
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
      interpretSynthesis(thesis, { ...base, conclusion: { ...base.conclusion, summary: "Traders should buy the dip." } }),
    ).toThrow(LlmOutputError);
  });

  it("drops generic invalidation conditions and unknown assumption ids", () => {
    const result = interpretSynthesis(thesis, {
      ...base,
      invalidation: [...base.invalidation, { condition: "Watch volatility.", dimension: "technical" }],
    });
    expect(result.invalidation).toEqual(base.invalidation);
    expect(result.reasoningByAssumption).toEqual({ A1: "Mixed." });
  });

  it("fails when no measurable invalidation condition remains", () => {
    expect(() =>
      interpretSynthesis(thesis, { ...base, invalidation: [{ condition: "Monitor the market.", dimension: "news" }] }),
    ).toThrow(/invalidation/);
  });
});
