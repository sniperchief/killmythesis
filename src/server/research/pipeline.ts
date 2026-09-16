/**
 * The live research pipeline:
 *
 *   THESIS → PARSER (LLM) → RESEARCH PLAN → COLLECTORS (Bitget REST + Signal MCP, concurrent)
 *   → EVIDENCE MAPPING (LLM interprets deterministic findings) → SCORING (deterministic)
 *   → SYNTHESIS (LLM prose) → BRIEF
 *
 * Emits the same ResearchEvents the UI already consumes. There is no sample fallback.
 */
import { coverageSummary } from "@/lib/coverage";
import { DIMENSIONS } from "@/lib/dimensions";
import type { ResearchEvent, RunOptions } from "@/lib/research/run-state";
import { evaluateThesis } from "@/lib/scoring";
import { buildResearchSnapshot } from "@/lib/snapshot";
import type { DimensionId, ResearchBrief, SourceCheck } from "@/lib/types";
import { FAILURE_TEXT, failureFromError, type ConnectorFailure } from "@/server/connectors/types";
import { LlmConfigError, LlmOutputError } from "@/server/llm/structured";
import {
  narrativeFindings,
  narrativeSymbols,
  originOf,
  parserContext,
  resolveNarrativeContext,
} from "@/server/radar/research-context";
import { COLLECTORS } from "./collectors";
import { mapEvidence } from "./mapper";
import { parseThesis, plannedDimensions } from "./parser";
import { measurableSignals } from "./signals";
import { synthesize } from "./synthesizer";
import { TIMEOUTS, withTimeout } from "./timeouts";
import type { CollectorContext, DimensionOutcome, Memo, ResearchDeps, ResearchTarget } from "./types";

/** The most common failure reason becomes the row note, e.g. "unavailable · timeout". */
export function unavailableNote(failures: ConnectorFailure[]): string {
  if (failures.length === 0) return "unavailable · no usable data";
  const counts = new Map<string, number>();
  for (const f of failures) {
    const text = FAILURE_TEXT[f.reason];
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return `unavailable · ${top[0]}`;
}

function createMemo(): Memo {
  const cache = new Map<string, Promise<unknown>>();
  return <T,>(key: string, load: () => Promise<T>) => {
    if (!cache.has(key)) cache.set(key, load());
    return cache.get(key) as Promise<T>;
  };
}

async function runDimension(
  dimension: DimensionId,
  base: Omit<CollectorContext, "failures">,
  signal?: AbortSignal,
): Promise<DimensionOutcome> {
  const ctx: CollectorContext = { ...base, failures: [] };
  let findings: DimensionOutcome["findings"] = [];
  try {
    findings = await withTimeout(`${DIMENSIONS[dimension].label} research`, TIMEOUTS.dimensionMs, (s) => COLLECTORS[dimension](ctx, s), signal);
  } catch (err) {
    ctx.failures.push(failureFromError(DIMENSIONS[dimension].label, err));
  }
  return {
    dimension,
    findings,
    failures: ctx.failures,
    unavailableNote: findings.length === 0 ? unavailableNote(ctx.failures) : undefined,
  };
}

const toSourceCheck = (o: DimensionOutcome): SourceCheck =>
  o.findings.length > 0 ? { dimension: o.dimension, status: "ok" } : { dimension: o.dimension, status: "unavailable", note: o.unavailableNote };

export async function runResearch(
  input: string,
  emit: (event: ResearchEvent) => void,
  deps: ResearchDeps,
  signal?: AbortSignal,
  options: RunOptions = {},
): Promise<void> {
  // A thesis launched from Narrative Radar carries server-resolved narrative context.
  const narrative = options.narrativeId ? await resolveNarrativeContext(options.narrativeId, deps.radar) : null;
  const parsed = await parseThesis(
    deps.llm,
    input,
    signal,
    narrative ? { payload: parserContext(narrative), symbols: narrativeSymbols(narrative) } : undefined,
  );
  if (parsed.kind === "clarification") {
    emit({ type: "clarification", clarification: parsed.clarification });
    return;
  }

  const { thesis, plan } = parsed;
  const target: ResearchTarget = parsed.target;
  const dimensions = plannedDimensions(plan);
  emit({ type: "parsed", thesis, plan: dimensions });

  for (const dimension of dimensions) emit({ type: "source", check: { dimension, status: "running" } });

  // The radar reading is real Bitget-derived data, so it joins market structure as deterministic findings.
  const radarFindings = narrative && target.subjectType === "narrative" ? narrativeFindings(narrative) : [];

  const base = { target, rest: deps.rest, mcp: deps.mcp, publicData: deps.publicData, memo: createMemo() };
  const outcomes = await Promise.all(
    dimensions.map(async (dimension) => {
      let outcome = await runDimension(dimension, base, signal);
      if (dimension === "market_structure" && radarFindings.length) {
        outcome = { ...outcome, findings: [...radarFindings, ...outcome.findings], unavailableNote: undefined };
      }
      emit({ type: "source", check: toSourceCheck(outcome) });
      return outcome;
    }),
  );
  signal?.throwIfAborted();
  const now = deps.now ?? (() => new Date());
  const collectedAt = now();

  const sources = outcomes.map(toSourceCheck);
  const findings = outcomes.flatMap((o) => o.findings);
  if (findings.length === 0) {
    emit({
      type: "error",
      message: `Research could not be completed: none of the ${dimensions.length} planned research sources returned usable data (${[
        ...new Set(outcomes.map((o) => `${DIMENSIONS[o.dimension].label}: ${o.unavailableNote?.replace("unavailable · ", "")}`)),
      ].join("; ")}).`,
    });
    return;
  }

  emit({ type: "evaluating" });
  const evidence = await mapEvidence(deps.llm, thesis, findings, signal);
  const evaluation = evaluateThesis(thesis, evidence, sources);
  const coverage = coverageSummary(sources);
  const signals = measurableSignals(findings, thesis.stance, target.symbols[0]);
  const synthesis = await synthesize(deps.llm, { thesis, evidence, evaluation, sources, signals, coverage }, signal);

  // The data used: every value the research used, source timestamps, and what failed.
  const snapshot = buildResearchSnapshot({
    capturedAt: collectedAt.toISOString(),
    subject: target.subject,
    symbols: target.symbols,
    sources,
    findings: findings.map(({ id, dimension, source, topic, observation, timestamp, rawValue }) => ({
      id,
      dimension,
      source,
      topic,
      observation,
      timestamp,
      ...(rawValue === undefined ? {} : { rawValue }),
    })),
    failures: outcomes.flatMap((o) =>
      o.failures.map((f) => ({ dimension: o.dimension, source: f.source, reason: FAILURE_TEXT[f.reason] })),
    ),
  });

  const createdAt = now();
  const brief: ResearchBrief = {
    id: `kmt-${createdAt.getTime().toString(36)}-${crypto.randomUUID().slice(0, 8)}`,
    createdAt: createdAt.toISOString(),
    mode: "live",
    ...(narrative ? { origin: originOf(narrative) } : {}),
    thesis,
    sources,
    snapshot,
    evidence,
    assumptions: evaluation.assumptions.map((a) => ({ ...a, reasoning: synthesis.reasoningByAssumption[a.assumptionId] ?? "" })),
    score: evaluation.score,
    verdict: evaluation.verdict,
    verdictSummary: synthesis.verdictSummary,
    invalidation: synthesis.invalidation,
    conclusion: synthesis.conclusion,
  };
  emit({ type: "brief", brief });
}

/** Runs the pipeline and converts every failure into a visible error event. */
export async function runResearchSafely(
  input: string,
  emit: (event: ResearchEvent) => void,
  deps: ResearchDeps,
  signal?: AbortSignal,
  options: RunOptions = {},
): Promise<void> {
  try {
    await runResearch(input, emit, deps, signal, options);
  } catch (err) {
    if (signal?.aborted) return;
    if (err instanceof LlmConfigError) {
      emit({ type: "error", message: err.message });
    } else if (err instanceof LlmOutputError) {
      emit({ type: "error", message: `Research could not be completed: ${err.message}` });
    } else {
      console.error("[research] unexpected failure", err);
      emit({ type: "error", message: "Research failed unexpectedly. No brief was produced." });
    }
  }
}
