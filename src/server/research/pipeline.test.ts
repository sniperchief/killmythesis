import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { ResearchEvent } from "@/lib/research/run-state";
import type { StructuredRequest } from "@/server/llm/structured";
import { runResearch, runResearchSafely } from "./pipeline";
import {
  SOL_PARSE,
  VAGUE_PARSE,
  failingMcp,
  fakeLlm,
  fakePublicData,
  fakeRest,
  mapperResponder,
  synthesisResponder,
} from "./test-fixtures";

const RAW = "I'm considering going long SOL because ecosystem activity is getting stronger and this pullback looks temporary.";

async function collect(run: (emit: (e: ResearchEvent) => void) => Promise<void>) {
  const events: ResearchEvent[] = [];
  await run((e) => events.push(e));
  return events;
}

describe("research pipeline", () => {
  it("completes with partial research failure and reports it truthfully", async () => {
    const requests: StructuredRequest<z.ZodType>[] = [];
    const mcpCalls: string[] = [];
    const llm = fakeLlm(
      { "Thesis parser": () => SOL_PARSE, "Evidence mapper": mapperResponder, "Brief writer": synthesisResponder },
      requests,
    );
    const deps = { llm, rest: fakeRest({ futures: false }), mcp: failingMcp(mcpCalls), publicData: fakePublicData() };

    const events = await collect((emit) => runResearch(RAW, emit, deps));
    const brief = events.find((e) => e.type === "brief");
    expect(brief?.type).toBe("brief");
    if (brief?.type !== "brief") return;

    // Bitget spot data and the public providers succeeded; futures timed out; the MCP returned no usable news.
    expect(brief.brief.sources).toEqual([
      { dimension: "market_structure", status: "ok" },
      { dimension: "technical", status: "ok" },
      { dimension: "positioning", status: "unavailable", note: "unavailable · timeout" },
      { dimension: "news", status: "unavailable", note: "unavailable · no usable data" },
      { dimension: "onchain", status: "ok" },
    ]);
    expect(mcpCalls).toContain("news_feed");

    // Evidence comes only from real findings, each carrying the provider that produced it.
    expect(brief.brief.mode).toBe("live");
    expect(brief.brief.thesis.raw).toBe(RAW);
    for (const e of brief.brief.evidence) {
      expect(e.source).toMatch(/^(Bitget Market API|DeFiLlama|CoinGecko)/);
      expect(["market_structure", "technical", "onchain"]).toContain(e.dimension);
    }
    expect(brief.brief.evidence.some((e) => e.finding.includes("SOLUSDT"))).toBe(true);
    expect(brief.brief.evidence.some((e) => e.finding.startsWith("Solana DeFi TVL changed"))).toBe(true);

    // Scoring is deterministic and coverage reflects the failures (3 of 5 dimensions).
    expect(brief.brief.score.coverage).toBeCloseTo(0.6);
    expect(brief.brief.invalidation).toEqual([
      { condition: "Daily close below the 50-day SMA while funding stays positive.", dimension: "technical" },
    ]);

    // Events arrive in the order the UI expects.
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("parsed");
    expect(types.indexOf("evaluating")).toBeLessThan(types.indexOf("brief"));
    expect(events.filter((e) => e.type === "source" && e.check.status === "running")).toHaveLength(5);

    // The mapper saw deterministic observations, not raw model-generated facts.
    const mapperPrompt = requests.find((r) => r.name === "Evidence mapper")?.prompt ?? "";
    expect(mapperPrompt).toContain("SOLUSDT last traded at 150.00 USDT");
  });

  it("stops with a visible error when every source fails", async () => {
    const requests: StructuredRequest<z.ZodType>[] = [];
    const llm = fakeLlm({ "Thesis parser": () => SOL_PARSE }, requests);
    const deps = { llm, rest: fakeRest({ spot: false, futures: false }), mcp: failingMcp(), publicData: fakePublicData(false) };

    const events = await collect((emit) => runResearch(RAW, emit, deps));
    expect(events.some((e) => e.type === "brief")).toBe(false);
    const error = events.at(-1);
    expect(error?.type).toBe("error");
    if (error?.type === "error") expect(error.message).toMatch(/none of the 5 planned research sources returned usable data/);
    expect(requests.map((r) => r.name)).toEqual(["Thesis parser"]);
  });

  it("asks for clarification without researching a vague thesis", async () => {
    const mcpCalls: string[] = [];
    const deps = {
      llm: fakeLlm({ "Thesis parser": () => VAGUE_PARSE }),
      rest: fakeRest(),
      mcp: failingMcp(mcpCalls),
      publicData: fakePublicData(),
    };
    const events = await collect((emit) => runResearch("ETH looks interesting here.", emit, deps));
    expect(events.map((e) => e.type)).toEqual(["clarification"]);
    expect(mcpCalls).toEqual([]);
  });

  it("converts LLM failures into an error event", async () => {
    const deps = {
      llm: fakeLlm({ "Thesis parser": () => ({ ...SOL_PARSE, assumptions: [] }) }),
      rest: fakeRest(),
      mcp: failingMcp(),
      publicData: fakePublicData(),
    };
    const events = await collect((emit) => runResearchSafely(RAW, emit, deps));
    expect(events).toEqual([
      { type: "error", message: "Research could not be completed: Thesis parser returned a testable thesis without assumptions." },
    ]);
  });
});
