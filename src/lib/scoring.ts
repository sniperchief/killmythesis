/**
 * Thesis evaluation — deterministic and documented.
 *
 * The score is an INTERNAL RESEARCH SCORE, not a probability. The LLM never
 * chooses numbers or verdicts: it only classifies each piece of evidence
 * (direction, confidence, relevance, linked assumptions) and writes prose.
 * Everything here is plain arithmetic on those classifications plus source
 * coverage, so the same evidence always produces the same result.
 *
 *   weight(e)             = confidence × relevance
 *   S, C                  = Σ weight of supporting / challenging evidence
 *
 *   evidenceSupport       = 100 × S / (S + C)                      all evidence (50 if none)
 *   marketConfirmation    = 100 × S / (S + C)                      market dimensions only (50 if none)
 *   contradictingEvidence = 100 × (sum of top-3 challenging weights) / 3
 *                           severity of the best counter-case; one counterpoint weighs less than three
 *   keyAssumptionRisk     = mean ASSUMPTION_RISK[result] over assumptions
 *
 *   raw   = 0.35·support + 0.25·market + 0.20·(100 − contradicting) + 0.20·(100 − assumptionRisk)
 *   total = 50 + (raw − 50) × coverage
 *           missing sources pull the score toward "no view" instead of inventing conviction
 */
import { MARKET_DIMENSIONS } from "./dimensions";
import type {
  Assumption,
  AssumptionResult,
  AssumptionScore,
  Evidence,
  ParsedThesis,
  SourceCheck,
  ThesisScore,
  Verdict,
} from "./types";

export const SCORE_WEIGHTS = {
  evidenceSupport: 0.35,
  marketConfirmation: 0.25,
  contradictingEvidence: 0.2,
  keyAssumptionRisk: 0.2,
} as const;

/** Risk contributed by each assumption result (0 = safe, 100 = broken). */
export const ASSUMPTION_RISK: Record<AssumptionResult, number> = {
  supported: 15,
  partially_supported: 35,
  uncertain: 55,
  insufficient_data: 60,
  weak: 75,
  contradicted: 90,
};

/** Below this combined weight an assumption's evidence is too thin to call. */
const MIN_ASSUMPTION_WEIGHT = 0.2;
/** Below this coverage, or with fewer directional items, we refuse to give a verdict. */
const MIN_COVERAGE = 0.4;
const MIN_DIRECTIONAL_EVIDENCE = 3;

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

export const weightOf = (e: Evidence) => clamp01(e.confidence) * clamp01(e.relevance);

function balance(items: Evidence[]) {
  const s = sum(items.filter((e) => e.direction === "supporting").map(weightOf));
  const c = sum(items.filter((e) => e.direction === "challenging").map(weightOf));
  return { s, c, ratio: s + c > 0 ? s / (s + c) : null };
}

/** Heaviest first; ties broken by id so the order never depends on input order. */
const byWeightDesc = (a: Evidence, b: Evidence) =>
  weightOf(b) - weightOf(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function classifyAssumption(assumption: Assumption, evidence: Evidence[]): AssumptionScore {
  const linked = evidence.filter((e) => e.assumptionIds.includes(assumption.id));
  const supporting = linked.filter((e) => e.direction === "supporting").sort(byWeightDesc);
  const challenging = linked.filter((e) => e.direction === "challenging").sort(byWeightDesc);
  const { s, c, ratio } = balance(linked);

  let result: AssumptionResult;
  if (ratio === null) result = "insufficient_data";
  else if (s + c < MIN_ASSUMPTION_WEIGHT) result = "uncertain";
  else if (ratio >= 0.75) result = "supported";
  else if (ratio >= 0.55) result = "partially_supported";
  else if (ratio > 0.45) result = "uncertain";
  else if (ratio >= 0.25) result = "weak";
  else result = "contradicted";

  return {
    assumptionId: assumption.id,
    result,
    supportWeight: round2(s),
    challengeWeight: round2(c),
    supportingIds: supporting.map((e) => e.id),
    challengingIds: challenging.map((e) => e.id),
  };
}

/** Share of finished source checks that returned data. */
export function sourceCoverage(sources: SourceCheck[]): number {
  const finished = sources.filter((s) => s.status === "ok" || s.status === "unavailable");
  if (finished.length === 0) return 0;
  return finished.filter((s) => s.status === "ok").length / finished.length;
}

export function verdictFor(
  total: number,
  assumptions: AssumptionScore[],
  coverage: number,
  directionalCount: number,
): Verdict {
  if (coverage < MIN_COVERAGE || directionalCount < MIN_DIRECTIONAL_EVIDENCE) return "INSUFFICIENT_DATA";
  const anyBroken = assumptions.some((a) => a.result === "weak" || a.result === "contradicted");
  const anyHolding = assumptions.some((a) => a.result === "supported" || a.result === "partially_supported");
  if (total >= 75) return anyBroken ? "SUPPORTED" : "STRONGLY_SUPPORTED";
  if (total >= 60) return "SUPPORTED";
  if (total >= 45) return anyHolding && anyBroken ? "PARTIALLY_SUPPORTED" : "MIXED";
  return "WEAK";
}

export interface ThesisEvaluation {
  assumptions: AssumptionScore[];
  score: ThesisScore;
  verdict: Verdict;
}

export function evaluateThesis(
  thesis: ParsedThesis,
  evidence: Evidence[],
  sources: SourceCheck[],
): ThesisEvaluation {
  const assumptions = thesis.assumptions.map((a) => classifyAssumption(a, evidence));

  const all = balance(evidence);
  const market = balance(evidence.filter((e) => MARKET_DIMENSIONS.has(e.dimension)));
  const topChallenges = evidence
    .filter((e) => e.direction === "challenging")
    .map(weightOf)
    .sort((a, b) => b - a)
    .slice(0, 3);

  const evidenceSupport = Math.round(100 * (all.ratio ?? 0.5));
  const marketConfirmation = Math.round(100 * (market.ratio ?? 0.5));
  const contradictingEvidence = Math.round((100 * sum(topChallenges)) / 3);
  const keyAssumptionRisk = assumptions.length
    ? Math.round(sum(assumptions.map((a) => ASSUMPTION_RISK[a.result])) / assumptions.length)
    : ASSUMPTION_RISK.insufficient_data;
  const coverage = sourceCoverage(sources);

  const raw =
    SCORE_WEIGHTS.evidenceSupport * evidenceSupport +
    SCORE_WEIGHTS.marketConfirmation * marketConfirmation +
    SCORE_WEIGHTS.contradictingEvidence * (100 - contradictingEvidence) +
    SCORE_WEIGHTS.keyAssumptionRisk * (100 - keyAssumptionRisk);
  const total = Math.round(50 + (raw - 50) * coverage);

  const directionalCount = evidence.filter((e) => e.direction !== "neutral").length;

  return {
    assumptions,
    score: { total, evidenceSupport, marketConfirmation, contradictingEvidence, keyAssumptionRisk, coverage },
    verdict: verdictFor(total, assumptions, coverage, directionalCount),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
