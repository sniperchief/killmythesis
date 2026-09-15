import { describe, expect, it } from "vitest";
import { LlmOutputError } from "@/server/llm/structured";
import { interpretParserOutput, normalizeSymbols, parseThesis, plannedDimensions } from "./parser";
import { SOL_PARSE, VAGUE_PARSE, fakeLlm } from "./test-fixtures";

const RAW = "I'm considering going long SOL because ecosystem activity is getting stronger and this pullback looks temporary.";

describe("thesis parser", () => {
  it("turns a valid parse into a thesis, assumptions and a research plan", async () => {
    const result = await parseThesis(fakeLlm({ "Thesis parser": () => SOL_PARSE }), RAW);
    expect(result.kind).toBe("thesis");
    if (result.kind !== "thesis") return;

    expect(result.thesis.raw).toBe(RAW);
    expect(result.thesis.subject).toBe("SOL");
    expect(result.thesis.stance).toBe("LONG");
    expect(result.thesis.assumptions.map((a) => a.id)).toEqual(["A1", "A2"]);
    expect(result.target.symbols).toEqual(["SOL"]);
    expect(result.plan[1]).toMatchObject({ assumptionId: "A2", dimensions: ["market_structure", "technical", "positioning"] });
    expect(plannedDimensions(result.plan)).toEqual(["market_structure", "technical", "positioning", "news", "onchain"]);
  });

  it("does not ask for a horizon, targets or metric definitions when direction and subject are clear", () => {
    // Regression: Haiku once flagged the SOL example as underspecified for lacking these.
    const result = interpretParserOutput(RAW, {
      ...SOL_PARSE,
      horizon: null,
      missing: ["Specific timeframe for the trade", "Definition of 'ecosystem activity'", "What price target or exit plan?"],
      clarification: "Please specify your time horizon and price target.",
    });
    expect(result.kind).toBe("thesis");
    if (result.kind === "thesis") expect(result.thesis.horizon).toBeNull();
  });

  it("returns a clarification for a vague thesis instead of inventing assumptions", async () => {
    const result = await parseThesis(fakeLlm({ "Thesis parser": () => VAGUE_PARSE }), "ETH looks interesting here.");
    expect(result).toEqual({
      kind: "clarification",
      clarification: {
        subject: "ETH",
        stance: null,
        known: [],
        missing: ["Direction (long or short)", "Reason for the view"],
        message: "What do you expect ETH to do, and why?",
      },
    });
  });

  it("asks for clarification when the subject cannot be identified", () => {
    const result = interpretParserOutput("prices will go up", { ...SOL_PARSE, subject: null, subjectType: "unknown", missing: [] });
    expect(result).toMatchObject({
      kind: "clarification",
      clarification: { subject: null, missing: ["Which asset or narrative this is about"] },
    });
  });

  it("rejects malformed parser output", () => {
    expect(() => interpretParserOutput(RAW, { ...SOL_PARSE, assumptions: [] })).toThrow(LlmOutputError);
    expect(() =>
      interpretParserOutput(RAW, { ...SOL_PARSE, assumptions: [{ ...SOL_PARSE.assumptions[0], dimensions: [] }] }),
    ).toThrow(/no research dimension/);
  });

  it("rejects model output that fails the schema", async () => {
    const llm = fakeLlm({ "Thesis parser": () => ({ stance: "LONG", subject: 42 }) });
    await expect(parseThesis(llm, RAW)).rejects.toThrow();
  });

  it("normalizes tickers", () => {
    expect(normalizeSymbols(["sol", "SOLUSDT", " eth ", "$BTC", "x"])).toEqual(["SOL", "ETH", "BTC"]);
  });
});
