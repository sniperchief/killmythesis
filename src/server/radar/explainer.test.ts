import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { ExplanationView } from "@/components/radar/ExplanationView";
import { buildRadarSnapshot, fmtPct } from "@/lib/radar/engine";
import { getNarrativeDefinition } from "@/lib/radar/taxonomy";
import { NOW, universe, type SeriesSpec } from "@/lib/radar/test-helpers";
import { LlmConfigError, LlmOutputError, type StructuredRequest } from "@/server/llm/structured";
import { fakeLlm } from "@/server/research/test-fixtures";
import { explainNarrative, narrativeFacts, ungroundedNumbers, type ExplanationOutput } from "./explainer";

const AI = getNarrativeDefinition("ai-compute")!;
const returns: Record<string, number> = { TAO: 12, FET: 9, RENDER: 8, WLD: 8, VIRTUAL: 7, ARKM: 6, IO: 5, NMR: -2 };
const entries: Record<string, SeriesSpec> = { BTC: { r7: 1, prior7: 1, r30: 2 } };
for (const symbol of AI.assets) entries[symbol] = { r7: returns[symbol], prior7: returns[symbol], r30: returns[symbol] };

const snapshot = buildRadarSnapshot(universe(entries), { mode: "live", now: NOW });
const reading = snapshot.narratives.find((n) => n.id === "ai-compute")!;
const unclassified = snapshot.narratives.find((n) => n.id === "defi")!;
const m = reading.metrics!;
const k = reading.assets.length;

const groundedSummary = `AI / Compute is classified as accelerating because the median 7-day return is ${fmtPct(m.median7d)} against BTC ${fmtPct(snapshot.benchmark!.return7d)}, and ${m.outperformCount} of ${k} tracked assets outperformed BTC.`;

const output = (overrides: Partial<ExplanationOutput> = {}): ExplanationOutput => ({
  summary: groundedSummary,
  strongestEvidence: [`${m.outperformCount} of ${k} tracked assets beat BTC over 7 days.`],
  weakeningEvidence: ["NMR is down over 7 days while the rest of the basket rose."],
  investigateNext: ["Check whether TAO's lead continues if BTC weakens."],
  ...overrides,
});

const explain = (response: ExplanationOutput | (() => never), requests: StructuredRequest<z.ZodType>[] = []) =>
  explainNarrative(reading, snapshot, () =>
    fakeLlm({ "Narrative explainer": typeof response === "function" ? response : () => response }, requests),
  );

describe("narrative explanation", () => {
  it("sends only deterministic facts and renders a grounded explanation", async () => {
    expect(reading.lifecycle).toBe("ACCELERATING");
    const requests: StructuredRequest<z.ZodType>[] = [];
    const result = await explain(output(), requests);

    expect(result).toMatchObject({ ok: true, removed: 0 });
    if (!result.ok) return;
    expect(result.explanation.summary).toBe(groundedSummary);
    const prompt = requests[0].prompt;
    expect(prompt).toContain('"lifecycle": "ACCELERATING"');
    expect(prompt).toContain(fmtPct(m.median7d));
    expect(prompt).toContain("News, social sentiment and on-chain data are not part of this classification.");

    const why = renderToStaticMarkup(createElement(ExplanationView, { result, part: "why" }));
    expect(why).toContain("AI / Compute is classified as accelerating");
    expect(why).toContain("Strongest evidence");
    expect(renderToStaticMarkup(createElement(ExplanationView, { result, part: "wrong" }))).toContain("NMR is down");
    expect(renderToStaticMarkup(createElement(ExplanationView, { result, part: "next" }))).toContain("What to investigate next");
  });

  it("rejects an explanation whose summary cites a metric that does not exist", async () => {
    const result = await explain(output({ summary: "AI / Compute rallied 91.3% as breadth hit 97% of assets." }));
    expect(result).toMatchObject({ ok: false, reason: "rejected" });
    if (result.ok) return;
    expect(result.message).toContain("figures not in the data (91.3, 97)");

    const html = renderToStaticMarkup(createElement(ExplanationView, { result, part: "why" }));
    expect(html).toContain("AI explanation unavailable");
    expect(html).toContain("calculated without AI and are unaffected");
    expect(renderToStaticMarkup(createElement(ExplanationView, { result, part: "wrong" }))).toBe("");
  });

  it("drops bullets with invented numbers, foreign assets, or trade instructions", async () => {
    const result = await explain(
      output({
        strongestEvidence: [`${m.outperformCount} of ${k} tracked assets beat BTC.`, "Open interest jumped 340% this week."],
        weakeningEvidence: ["DOGE is rallying harder than this basket.", "NMR lagged the basket."],
        investigateNext: ["Traders should buy now before the move extends."],
      }),
    );
    expect(result).toMatchObject({ ok: true, removed: 3 });
    if (!result.ok) return;
    expect(result.explanation.strongestEvidence).toEqual([`${m.outperformCount} of ${k} tracked assets beat BTC.`]);
    expect(result.explanation.weakeningEvidence).toEqual(["NMR lagged the basket."]);
    expect(result.explanation.investigateNext).toEqual([]);
  });

  it("rejects a summary that changes the lifecycle stage", async () => {
    const result = await explain(output({ summary: "AI / Compute is fading as participation narrows." }));
    expect(result).toMatchObject({ ok: false, reason: "rejected" });
    if (!result.ok) expect(result.message).toContain("a different lifecycle stage (fading)");
  });

  it("allows rounded figures but not unsupported ones", () => {
    const facts = narrativeFacts(reading, snapshot)!;
    const allowed = [...new Set(JSON.stringify(facts).match(/\d+(?:\.\d+)?/g)!.map(Number))];
    expect(ungroundedNumbers(`Median return about ${Math.round(m.median7d)}%`, allowed)).toEqual([]);
    expect(ungroundedNumbers("Returns of 55.5%", allowed)).toEqual(["55.5"]);
  });

  it("handles a missing API key, a failed model call, and unclassified narratives gracefully", async () => {
    const noKey = await explainNarrative(reading, snapshot, () => {
      throw new LlmConfigError("ANTHROPIC_API_KEY is not configured on the server. Add it to .env.local and restart.");
    });
    expect(noKey).toMatchObject({ ok: false, reason: "not_configured" });

    const failed = await explain(() => {
      throw new LlmOutputError("Narrative explainer: the model output was truncated.");
    });
    expect(failed).toMatchObject({ ok: false, reason: "failed", message: "AI explanation unavailable: Narrative explainer: the model output was truncated." });

    const requests: StructuredRequest<z.ZodType>[] = [];
    const skipped = await explainNarrative(unclassified, snapshot, () => fakeLlm({}, requests));
    expect(skipped).toMatchObject({ ok: false, reason: "insufficient_data" });
    expect(requests).toHaveLength(0);
  });
});
