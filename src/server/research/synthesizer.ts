/**
 * FINAL SYNTHESIS (LLM prose constrained by deterministic results).
 *
 * Verdict, score and assumption results are computed before this call and given to the model
 * as fixed facts, together with the measurable signals available for invalidation (signals.ts).
 * The model writes explanation text and picks invalidation thresholds by id. It never supplies
 * numbers or thresholds: condition text is rendered by code, and a rationale that cites a number
 * absent from the facts is dropped.
 */
import { z } from "zod";
import { DIMENSIONS } from "@/lib/dimensions";
import { RESULT_META, VERDICT_META } from "@/lib/labels";
import { ASSUMPTION_RISK, weightOf, type ThesisEvaluation } from "@/lib/scoring";
import type { Evidence, InvalidationCondition, ParsedThesis, SourceCheck } from "@/lib/types";
import { allowedNumbers, ungroundedNumbers } from "@/server/llm/grounding";
import { LlmOutputError, type StructuredLlm } from "@/server/llm/structured";
import { renderClause, renderCondition, type MeasurableSignal, type SignalThreshold } from "./signals";

const MAX_CONDITIONS = 4;
const MAX_CLAUSES = 2;

export const SynthesisOutput = z.object({
  verdictSummary: z.string(),
  assumptionReasoning: z.array(z.object({ assumptionId: z.string(), reasoning: z.string() })),
  invalidation: z.array(
    z.object({
      thresholdIds: z.array(z.string()),
      assumptionIds: z.array(z.string()),
      rationale: z.string(),
    }),
  ),
  conclusion: z.object({ strongestFor: z.string(), strongestAgainst: z.string(), summary: z.string() }),
});
export type SynthesisOutput = z.infer<typeof SynthesisOutput>;

export interface Synthesis {
  verdictSummary: string;
  reasoningByAssumption: Record<string, string>;
  invalidation: InvalidationCondition[];
  conclusion: { strongestFor: string; strongestAgainst: string; summary: string };
}

export interface SynthesisContext {
  thesis: ParsedThesis;
  evidence: Evidence[];
  evaluation: ThesisEvaluation;
  sources: SourceCheck[];
  /** Already filtered to thresholds that contradict the thesis (see measurableSignals). */
  signals: MeasurableSignal[];
  coverage: string | null;
}

const SYSTEM = `You write the final research brief for KillMyThesis, a research desk that tried to disprove a trader's thesis.

The verdict, score, per-assumption results and the measurable signals were computed deterministically. Treat them as fixed; do not contradict or re-score them.

Write:
- verdictSummary: 1-2 sentences explaining the verdict in plain language.
- assumptionReasoning: one or two sentences per assumption explaining its result, citing the evidence.
- invalidation: 2-4 items (an empty list if measurableSignals is empty). Each item:
  - thresholdIds: 1 or 2 ids copied exactly from measurableSignals. Two ids read as "X while Y". Never write a condition or a threshold yourself.
  - assumptionIds: the assumptions crossing it would break.
  - rationale: one sentence on why crossing it would weaken the thesis.
- conclusion.strongestFor / strongestAgainst: the single strongest evidence on each side.
- conclusion.summary: 3-5 sentences that acknowledge the original thesis, weigh the strongest support against the strongest counter-evidence, name the weakest assumption, and state what would invalidate the thesis.

Rules:
- Use only facts given here. Every number you write must appear in the facts. Never invent numbers, thresholds, events, sources or data, and never describe what an unavailable source would have shown.
- This is research, not advice. Never tell the reader to buy, sell, go long, go short, enter or exit a position, or set targets or stops. The trader decides.
- If research dimensions were unavailable, acknowledge the gap where it matters.`;

const TRADE_INSTRUCTION = [
  /\b(you|traders?) should (buy|sell|go long|go short|enter|exit|open|close|accumulate|take profit)/i,
  /\b(we|i) (recommend|suggest|advise)\b/i,
  /\b(buy|sell|short|long)\s+(it\s+)?(now|here|today|immediately)\b/i,
  /\b(enter|open)\s+(a\s+)?(long|short)\s+position\b/i,
  /\b(take[- ]profit|stop[- ]loss)\s+(at|near|around)\b/i,
];

export function containsTradeInstruction(text: string): boolean {
  return TRADE_INSTRUCTION.some((re) => re.test(text));
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

/** The facts the model receives. Also the grounding corpus: prose may only cite numbers found here. */
export function synthesisFacts(ctx: SynthesisContext) {
  const { thesis, evidence, evaluation, sources, signals, coverage } = ctx;
  return {
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
    weakestAssumptionId: weakestAssumptionId(evaluation),
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
    measurableSignals: signals.flatMap((s) =>
      s.thresholds.map((t) => ({ thresholdId: t.id, dimension: DIMENSIONS[s.dimension].label, condition: renderClause(s, t) })),
    ),
    researchCoverage: coverage,
    unavailableDimensions: sources.filter((s) => s.status === "unavailable").map((s) => DIMENSIONS[s.dimension].label),
  };
}

type Clause = { signal: MeasurableSignal; threshold: SignalThreshold };

function conditionFrom(clauses: Clause[], assumptionIds: string[], rationale: string): InvalidationCondition {
  return {
    condition: renderCondition(clauses),
    dimension: clauses[0].signal.dimension,
    signals: clauses.map(({ signal, threshold }) => ({
      findingId: signal.findingId,
      label: signal.label,
      current: signal.currentText,
      comparator: threshold.comparator,
      threshold: threshold.text,
    })),
    assumptionIds,
    ...(rationale ? { rationale } : {}),
  };
}

/** When the model offers no usable condition: the strongest supporting evidence, turned into its signals. */
function fallbackInvalidation(ctx: SynthesisContext): InvalidationCondition[] {
  const out: InvalidationCondition[] = [];
  const used = new Set<string>();
  const supporting = ctx.evidence.filter((e) => e.direction === "supporting").sort((a, b) => weightOf(b) - weightOf(a));
  const candidates: { signal: MeasurableSignal; assumptionIds: string[] }[] = [
    ...supporting.flatMap((e) =>
      ctx.signals.filter((s) => s.findingId === e.findingId).map((signal) => ({ signal, assumptionIds: e.assumptionIds })),
    ),
    ...ctx.signals.map((signal) => ({ signal, assumptionIds: [] })),
  ];
  for (const { signal, assumptionIds } of candidates) {
    if (used.has(signal.id)) continue;
    used.add(signal.id);
    out.push(conditionFrom([{ signal, threshold: signal.thresholds[0] }], assumptionIds, ""));
    if (out.length === 2) break;
  }
  return out;
}

/** Deterministic validation of the model's synthesis. Throws LlmOutputError when it breaks the rules. */
export function interpretSynthesis(ctx: SynthesisContext, output: SynthesisOutput): Synthesis {
  const { thesis, signals } = ctx;

  const headline = [
    output.verdictSummary,
    output.conclusion.summary,
    output.conclusion.strongestFor,
    output.conclusion.strongestAgainst,
    ...output.assumptionReasoning.map((r) => r.reasoning),
  ].join("\n");
  if (containsTradeInstruction(headline)) {
    throw new LlmOutputError("Synthesis contained a trade instruction; the brief was not published.");
  }

  const allowed = allowedNumbers(synthesisFacts(ctx));
  /** The trimmed text when it is grounded and not a trade instruction, otherwise "". */
  const grounded = (text: string) => {
    const t = text.trim();
    return t && !containsTradeInstruction(t) && ungroundedNumbers(t, allowed).length === 0 ? t : "";
  };

  const ids = new Set(thesis.assumptions.map((a) => a.id));
  const reasoningByAssumption: Record<string, string> = {};
  for (const r of output.assumptionReasoning) {
    if (ids.has(r.assumptionId) && r.reasoning.trim()) reasoningByAssumption[r.assumptionId] = r.reasoning.trim();
  }

  // Only thresholds that were offered; condition text rendered by code.
  const offered = new Map<string, Clause>(
    signals.flatMap((signal) => signal.thresholds.map((threshold) => [threshold.id, { signal, threshold }] as const)),
  );
  const invalidation: InvalidationCondition[] = [];
  const seen = new Set<string>();
  for (const item of output.invalidation) {
    const clauses: Clause[] = [];
    for (const id of item.thresholdIds) {
      const clause = offered.get(id);
      if (clause && !clauses.some((c) => c.signal.id === clause.signal.id)) clauses.push(clause);
      if (clauses.length === MAX_CLAUSES) break;
    }
    if (clauses.length === 0) continue;
    const condition = conditionFrom(clauses, item.assumptionIds.filter((id) => ids.has(id)), grounded(item.rationale));
    if (seen.has(condition.condition)) continue;
    seen.add(condition.condition);
    invalidation.push(condition);
    if (invalidation.length === MAX_CONDITIONS) break;
  }
  if (invalidation.length === 0 && signals.length > 0) invalidation.push(...fallbackInvalidation(ctx));

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

export async function synthesize(llm: StructuredLlm, ctx: SynthesisContext, signal?: AbortSignal): Promise<Synthesis> {
  const prompt = JSON.stringify(synthesisFacts(ctx), null, 1);
  const output = await llm({ name: "Brief writer", system: SYSTEM, prompt, schema: SynthesisOutput }, signal);
  return interpretSynthesis(ctx, output);
}
