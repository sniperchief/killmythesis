/**
 * Integration: Narrative Radar → Form a Thesis → KillMyThesis preserves the narrative context,
 * from the handoff URL through the client runner, the API handler and the research pipeline,
 * into the saved history entry.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { briefToHistoryEntry } from "@/lib/history";
import { buildRadarSnapshot, startingTheses } from "@/lib/radar/engine";
import { handoffHref, parseHandoff } from "@/lib/radar/handoff";
import { getNarrativeDefinition } from "@/lib/radar/taxonomy";
import { NOW, universe, type SeriesSpec } from "@/lib/radar/test-helpers";
import { liveRunner } from "@/lib/research/live-runner";
import type { ResearchEvent, RunOptions } from "@/lib/research/run-state";
import type { BitgetRest } from "@/server/connectors/bitget-rest";
import { createDefaultLlm, type StructuredRequest } from "@/server/llm/structured";
import { handleResearchRequest } from "./http";
import type { ParserOutput } from "./parser";
import { runResearch } from "./pipeline";
import { failingMcp, fakeLlm, fakePublicData, fakeRest, mapperResponder, synthesisResponder } from "./test-fixtures";

const AI = getNarrativeDefinition("ai-compute")!;
const entries: Record<string, SeriesSpec> = { BTC: { r7: 1, prior7: 1, r30: 2 } };
AI.assets.forEach((symbol, i) => (entries[symbol] = { r7: 9 - i, prior7: 8, r30: 12 }));
const snapshot = buildRadarSnapshot(universe(entries), { mode: "live", now: NOW });
const reading = snapshot.narratives.find((n) => n.id === "ai-compute")!;

const NARRATIVE_PARSE: ParserOutput = {
  subject: "AI / Compute",
  subjectType: "narrative",
  stance: "NARRATIVE",
  statedReasons: [],
  symbols: ["TAO", "FET"],
  coreThesis: "The AI / Compute narrative has further to run.",
  horizon: null,
  assumptions: [
    { text: "AI / Compute outperformance is broad-based.", kind: "price_action", dimensions: ["market_structure"], researchTasks: ["Check basket breadth"] },
    { text: "Momentum in the basket is intact.", kind: "price_action", dimensions: ["technical"], researchTasks: ["Check trend"] },
  ],
  newsKeywords: ["AI"],
  missing: [],
  clarification: "",
};

function recordingRest(pairs: string[]): BitgetRest {
  const rest = fakeRest();
  return {
    ...rest,
    spotCandles: (symbol, granularity, limit, signal) => {
      pairs.push(symbol);
      return rest.spotCandles(symbol, granularity, limit, signal);
    },
  };
}

async function research(thesis: string, parse: ParserOutput, radar: () => Promise<typeof snapshot>) {
  const requests: StructuredRequest<z.ZodType>[] = [];
  const pairs: string[] = [];
  const events: ResearchEvent[] = [];
  const deps = {
    llm: fakeLlm({ "Thesis parser": () => parse, "Evidence mapper": mapperResponder, "Brief writer": synthesisResponder }, requests),
    rest: recordingRest(pairs),
    mcp: failingMcp(),
    publicData: fakePublicData(),
    radar,
  };
  await runResearch(thesis, (e) => events.push(e), deps, undefined, { narrativeId: "ai-compute" });
  const brief = events.find((e) => e.type === "brief");
  if (brief?.type !== "brief") throw new Error(`No brief: ${JSON.stringify(events.at(-1))}`);
  return { brief: brief.brief, requests, pairs };
}

describe("Narrative Radar → KillMyThesis handoff", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const thesis = startingTheses(reading).form;

  it("carries the narrative id and editable thesis through the URL without running", () => {
    const form = parseHandoff(Object.fromEntries(new URL(handoffHref("ai-compute", thesis), "http://localhost").searchParams));
    expect(form).toEqual({ thesis, autoRun: false, narrative: { id: "ai-compute", name: "AI / Compute", assets: AI.assets } });

    const kill = parseHandoff(Object.fromEntries(new URL(handoffHref("ai-compute", "Edited claim about AI", true), "http://localhost").searchParams));
    expect(kill).toMatchObject({ thesis: "Edited claim about AI", autoRun: true, narrative: { id: "ai-compute" } });

    expect(parseHandoff({ thesis: "x", narrative: "not-a-narrative" }).narrative).toBeNull();
  });

  it("sends only the narrative id with the research request, and the API passes it to the pipeline", async () => {
    let body: unknown;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(`${JSON.stringify({ type: "error", message: "stop" })}\n`, { status: 200 });
    });
    await liveRunner(thesis, () => {}, new AbortController().signal, { narrativeId: "ai-compute" });
    expect(body).toEqual({ thesis, narrativeId: "ai-compute" });

    const post = (payload: unknown) =>
      new Request("http://localhost/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const makeDeps = () => ({ llm: createDefaultLlm({ ANTHROPIC_API_KEY: "sk-test" }), rest: fakeRest(), mcp: failingMcp(), publicData: fakePublicData() });

    let received: RunOptions | undefined;
    const res = await handleResearchRequest(post(body), makeDeps, async (_thesis, emit, _deps, _signal, options) => {
      received = options;
      emit({ type: "error", message: "stop" });
    });
    await res.text();
    expect(received).toEqual({ narrativeId: "ai-compute" });

    expect((await handleResearchRequest(post({ thesis, narrativeId: "made-up" }), makeDeps)).status).toBe(400);
  });

  it("researches the radar basket with structured context and records the origin in history", async () => {
    const { brief, requests, pairs } = await research(thesis, NARRATIVE_PARSE, async () => snapshot);

    // Context goes to the parser as a separate structured block; the thesis text is untouched.
    const parserPrompt = requests.find((r) => r.name === "Thesis parser")!.prompt;
    expect(parserPrompt.startsWith(`<thesis>\n${thesis}\n</thesis>\n\n<narrative_context>`)).toBe(true);
    expect(parserPrompt).toContain('"narrative": "AI / Compute"');
    expect(parserPrompt).toContain('"lifecycle": "Accelerating"');
    expect(brief.thesis.raw).toBe(thesis);

    // The basket is the radar's verified assets, not the two the model picked.
    for (const symbol of AI.assets) expect(pairs).toContain(`${symbol}USDT`);

    // The radar reading joins the evidence as a deterministic market-structure finding.
    const radarEvidence = brief.evidence.find((e) => e.finding.startsWith("Narrative Radar classified AI / Compute as ACCELERATING"));
    expect(radarEvidence?.dimension).toBe("market_structure");
    expect(radarEvidence?.source).toContain("KillMyThesis Narrative Radar");

    expect(brief.origin).toEqual({
      kind: "narrative",
      narrativeId: "ai-compute",
      narrativeName: "AI / Compute",
      lifecycle: "ACCELERATING",
      assets: AI.assets,
      snapshotAt: snapshot.generatedAt,
    });

    const entry = briefToHistoryEntry(brief);
    expect(entry.brief.origin?.narrativeName).toBe("AI / Compute");
    expect(entry.brief.thesis.raw).toBe(thesis);
    expect(entry.label).toBeTruthy();
    expect(typeof entry.brief.score.total).toBe("number");
  });

  it("still records the origin when the radar snapshot is unavailable, without inventing metrics", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { brief, requests } = await research(thesis, NARRATIVE_PARSE, async () => {
      throw new Error("radar down");
    });
    expect(brief.origin).toMatchObject({ narrativeId: "ai-compute", lifecycle: null, snapshotAt: null, assets: AI.assets });
    expect(requests[0].prompt).toContain('"radarMetrics": null');
    expect(brief.evidence.some((e) => e.source.includes("Narrative Radar"))).toBe(false);
  });

  it("does not force the narrative basket onto a thesis the user rewrote about a single asset", async () => {
    const solParse: ParserOutput = { ...NARRATIVE_PARSE, subject: "SOL", subjectType: "asset", stance: "LONG", symbols: ["SOL"] };
    const { brief, pairs } = await research("Actually I'm long SOL because it leads AI flows.", solParse, async () => snapshot);
    expect(pairs).toContain("SOLUSDT");
    expect(pairs).not.toContain("TAOUSDT");
    expect(brief.evidence.some((e) => e.source.includes("Narrative Radar"))).toBe(false);
    expect(brief.origin?.narrativeId).toBe("ai-compute");
  });
});
