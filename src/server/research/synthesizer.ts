/**
 * FINAL SYNTHESIS (LLM prose constrained by deterministic results).
 * Verdict, score and assumption results are computed before this call and given
 * to the model as fixed facts. The model writes explanation text only.
 */
import { z } from "zod";
import { DIMENSION_ORDER, DIMENSIONS } from "@/lib/dimensions";
import { RESULT_META, VERDICT_META } from "@/lib/labels";
import { ASSUMPTION_RISK, weightOf, type ThesisEvaluation } from "@/lib/scoring";
import type { DimensionId, Evidence, InvalidationCondition, ParsedThesis, SourceCheck } from "@/lib/types";
import { LlmOutputError, type StructuredLlm } from "@/server/llm/structured";

const DIMENSION_IDS = DIMENSION_ORDER as [DimensionId, ...DimensionId[]];

export const SynthesisOutput = z.object({
  verdictSummary: z.string(),
  assumptionReasoning: z.array(z.object({ assumptionId: z.string(), reasoning: z.string() })),
  invalidation: z.array(z.object({ condition: z.string(), dimension: z.enum(DIMENSION_IDS) })),
  conclusion: z.object({ strongestFor: z.string(), strongestAgainst: z.string(), summary: z.string() }),
});
export type SynthesisOutput = z.infer<typeof SynthesisOutput>;

export interface Synthesis {
  verdictSummary: string;
  reasoningByAssumption: Record<string, string>;
  invalidation: InvalidationCondition[];
  conclusion: { strongestFor: string; strongestAgainst: string; summary: string };
}

const SYSTEM = `You write the final research brief for KillMyThesis, a research desk that tried to disprove a trader's thesis.

The verdict, score and per-assumption results were already computed deterministically. Treat them as fixed; do not contradict or re-score them.

Write:
- verdictSummary: 1-2 sentences explaining the verdict in plain language.
- assumptionReasoning: one or two sentences per assumption explaining its result, citing the evidence.
- invalidation: 2-4 concrete, measurable conditions that would invalidate the thesis, each tied to a dimension that can observe it (e.g. "Daily close below the 50-day moving average while funding stays positive"). No generic advice such as "monitor the market" or "watch volatility".
- conclusion.strongestFor / strongestAgainst: the single strongest evidence on each side.
- conclusion.summary: 3-5 sentences that acknowledge the original thesis, weigh the strongest support against the strongest counter-evidence, name the weakest assumption, and state what would invalidate the thesis.

Rules:
- Use only facts present in the evidence. Never invent numbers or events.
- This is research, not advice. Never tell the reader to buy, sell, go long, go short, enter or exit a position, or set targets or stops. The trader decides.
- If research dimensions were unavailable, acknowledge the gap where it matters.`;

const TRADE_INSTRUCTION = [
  /\b(you|traders?) should (buy|sell|go long|go short|enter|exit|open|close|accumulate|take profit)/i,
  /\b(we|i) (recommend|suggest|advise)\b/i,
  /\b(buy|sell|short|long)\s+(it\s+)?(now|here|today|immediately)\b/i,
  /\b(enter|open)\s+(a\s+)?(long|short)\s+position\b/i,
  /\b(take[- ]profit|stop[- ]loss)\s+(at|near|around)\b/i,
];

const GENERIC_CONDITION = /\b(monitor the market|watch (the )?volatility|things (could|can) change|market conditions change)\b/i;

export function containsTradeInstruction(text: string): boolean {
  return TRADE_INSTRUCTION.some((re) => re.test(text));
}

/** Deterministic validation of the model's synthesis. Throws LlmOutputError when it breaks the rules. */
export function interpretSynthesis(thesis: ParsedThesis, output: SynthesisOutput): Synthesis {
  const allText = [
    output.verdictSummary,
    output.conclusion.summary,
    output.conclusion.strongestFor,
    output.conclusion.strongestAgainst,
    ...output.assumptionReasoning.map((r) => r.reasoning),
    ...output.invalidation.map((i) => i.condition),
  ].join("\n");
  if (containsTradeInstruction(allText)) {
    throw new LlmOutputError("Synthesis contained a trade instruction; the brief was not published.");
  }

  const invalidation = output.invalidation
    .map((i) => ({ condition: i.condition.trim(), dimension: i.dimension }))
    .filter((i) => i.condition && !GENERIC_CONDITION.test(i.condition))
    .slice(0, 5);
  if (invalidation.length === 0) throw new LlmOutputError("Synthesis produced no measurable invalidation conditions.");

  const ids = new Set(thesis.assumptions.map((a) => a.id));
  const reasoningByAssumption: Record<string, string> = {};
  for (const r of output.assumptionReasoning) {
    if (ids.has(r.assumptionId) && r.reasoning.trim()) reasoningByAssumption[r.assumptionId] = r.reasoning.trim();
  }

  const summary = output.conclusion.summary.trim();
  if (!summary || !output.verdictSummary.trim()) throw new LlmOutputError("Synthesis was missing its conclusion.");

  return {
    verdictSummary: output.verdictSummary.trim(),
    reasoningByAssumption,
    invalidation,
    conclusion: {
      strongestFor: output.conclusion.strongestFor.trim(),
      strongestAgainst: output.conclusion.strongestAgainst.trim(),
      summary,
    },
  };
}

/** The assumption with the highest deterministic risk (ties → first stated). */
export function weakestAssumptionId(evaluation: ThesisEvaluation): string | null {
  let weakest: string | null = null;
  let worst = -1;
  for (const a of evaluation.assumptions) {
    if (ASSUMPTION_RISK[a.result] > worst) {
      worst = ASSUMPTION_RISK[a.result];
      weakest = a.assumptionId;
    }
  }
  return weakest;
}

export async function synthesize(
  llm: StructuredLlm,
  thesis: ParsedThesis,
  evidence: Evidence[],
  evaluation: ThesisEvaluation,
  sources: SourceCheck[],
  coverage: string | null,
  signal?: AbortSignal,
): Promise<Synthesis> {
  const weakest = weakestAssumptionId(evaluation);
  const prompt = JSON.stringify(
    {
      thesis: { subject: thesis.subject, stance: thesis.stance, coreThesis: thesis.coreThesis, raw: thesis.raw },
      verdict: VERDICT_META[evaluation.verdict].label,
      score: evaluation.score,
      assumptions: thesis.assumptions.map((a) => {
        const result = evaluation.assumptions.find((r) => r.assumptionId === a.id);
        return {
          assumptionId: a.id,
          text: a.text,
          result: result ? RESULT_META[result.result].label : "No data",
          supportingEvidenceIds: result?.supportingIds ?? [],
          challengingEvidenceIds: result?.challengingIds ?? [],
        };
      }),
      weakestAssumptionId: weakest,
      evidence: [...evidence]
        .sort((a, b) => weightOf(b) - weightOf(a))
        .map((e) => ({
          id: e.id,
          dimension: DIMENSIONS[e.dimension].label,
          direction: e.direction,
          assumptionIds: e.assumptionIds,
          finding: e.finding,
          explanation: e.explanation,
        })),
      researchCoverage: coverage,
      unavailableDimensions: sources.filter((s) => s.status === "unavailable").map((s) => s.dimension),
    },
    null,
    1,
  );

  const output = await llm({ name: "Brief writer", system: SYSTEM, prompt, schema: SynthesisOutput }, signal);
  return interpretSynthesis(thesis, output);
}
