/**
 * Domain model for KillMyThesis.
 *
 * Every research surface — thesis briefs, Narrative Radar, and future modules
 * (historical stress tests, portfolio research, post-trade review) — is built
 * on these types so new features plug into the same evidence pipeline.
 */

/** "live" = produced by the real research pipeline. "sample" = labeled UI fixture. */
export type DataMode = "live" | "sample";

// ─── Thesis ──────────────────────────────────────────────────────────────────

export type Stance = "LONG" | "SHORT" | "NARRATIVE" | "QUESTION";

export type AssumptionKind =
  | "fundamental"
  | "adoption"
  | "price_action"
  | "positioning"
  | "sentiment"
  | "macro"
  | "valuation";

export interface Assumption {
  id: string;
  text: string;
  kind: AssumptionKind;
}

/** Returned instead of a ParsedThesis when the input is too vague to test. */
export interface ThesisClarification {
  subject: string | null;
  stance: Stance | null;
  known: string[];
  missing: string[];
  message: string;
}

export interface ParsedThesis {
  raw: string;
  /** Asset or narrative under test, e.g. "SOL" or "AI / Compute". */
  subject: string;
  stance: Stance;
  coreThesis: string;
  horizon: string | null;
  assumptions: Assumption[];
}

// ─── Research sources ────────────────────────────────────────────────────────

export type DimensionId =
  | "market_structure"
  | "technical"
  | "positioning"
  | "sentiment"
  | "news"
  | "macro"
  | "onchain";

/** A source is only "ok" when its underlying call actually returned usable data. */
export type SourceStatus = "queued" | "running" | "ok" | "unavailable";

export interface SourceCheck {
  dimension: DimensionId;
  status: SourceStatus;
  /** Shown when unavailable, e.g. "unavailable · timeout". */
  note?: string;
}

// ─── Evidence ────────────────────────────────────────────────────────────────

export type EvidenceDirection = "supporting" | "challenging" | "neutral";

/** Where a user can check the data behind a finding. Only set when a real page or public endpoint exists. */
export interface VerifyLink {
  url: string;
  /** What the link opens, e.g. "Bitget chart", "Bitget API data", "DeFiLlama". */
  label: string;
}

export interface Evidence {
  id: string;
  /** The deterministic finding this evidence interprets (absent on briefs saved before snapshots). */
  findingId?: string;
  source: string;
  dimension: DimensionId;
  topic: string;
  finding: string;
  direction: EvidenceDirection;
  /** 0–1: how reliable the finding is. */
  confidence: number;
  /** 0–1: how directly it bears on the linked assumptions. */
  relevance: number;
  timestamp: string | null;
  /** Why this evidence matters for the thesis. */
  explanation: string;
  assumptionIds: string[];
  /** The validated data point(s) behind the finding, when available. */
  rawValue?: unknown;
  verify?: VerifyLink;
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

export type AssumptionResult =
  | "supported"
  | "partially_supported"
  | "uncertain"
  | "weak"
  | "contradicted"
  | "insufficient_data";

/** Deterministic part of an assumption evaluation (see lib/scoring.ts). */
export interface AssumptionScore {
  assumptionId: string;
  result: AssumptionResult;
  supportWeight: number;
  challengeWeight: number;
  supportingIds: string[];
  challengingIds: string[];
}

export interface AssumptionEvaluation extends AssumptionScore {
  reasoning: string;
}

export type Verdict =
  | "STRONGLY_SUPPORTED"
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "MIXED"
  | "WEAK"
  | "INSUFFICIENT_DATA";

/** Internal research score. Not a probability. */
export interface ThesisScore {
  total: number;
  evidenceSupport: number;
  marketConfirmation: number;
  /** Higher = stronger counter-case. */
  contradictingEvidence: number;
  /** Higher = weaker assumptions. */
  keyAssumptionRisk: number;
  /** 0–1 share of planned sources that returned data. */
  coverage: number;
}

/** One measurable clause of an invalidation condition. Every value comes from the research snapshot. */
export interface InvalidationSignal {
  findingId: string;
  label: string;
  /** The value in the snapshot, formatted. */
  current: string;
  comparator: "below" | "above";
  /** A data-derived or neutral level (0, 50%, 1.00×, a moving average from the candles). */
  threshold: string;
}

export interface InvalidationCondition {
  /** Rendered deterministically from `signals` on current briefs. */
  condition: string;
  dimension: DimensionId;
  signals?: InvalidationSignal[];
  assumptionIds?: string[];
  /** Why crossing it would weaken the thesis (AI, grounded; omitted when it failed validation). */
  rationale?: string;
}

// ─── Research snapshot ───────────────────────────────────────────────────────

/** A finding exactly as the research used it, including the validated values behind it. */
export interface SnapshotFinding {
  id: string;
  dimension: DimensionId;
  source: string;
  topic: string;
  observation: string;
  timestamp: string | null;
  rawValue?: unknown;
}

export interface SnapshotFailure {
  dimension: DimensionId;
  source: string;
  reason: string;
}

/** The data a verdict was built on, as retrieved when the research ran. Shown as "Data used". */
export interface ResearchSnapshot {
  version: 1;
  /** When the market data collection finished. */
  capturedAt: string;
  subject: string;
  symbols: string[];
  sources: SourceCheck[];
  findings: SnapshotFinding[];
  failures: SnapshotFailure[];
}

/** Where a research run started. Absent for theses typed directly into KillMyThesis. */
export interface ResearchOrigin {
  kind: "narrative";
  narrativeId: string;
  narrativeName: string;
  /** Lifecycle at the time of the handoff; null when the radar could not classify it. */
  lifecycle: NarrativeState | null;
  /** Representative assets used as the research basket. */
  assets: string[];
  /** When the radar's market data was retrieved; null when the radar snapshot was unavailable. */
  snapshotAt: string | null;
}

export interface ResearchBrief {
  id: string;
  createdAt: string;
  mode: DataMode;
  origin?: ResearchOrigin;
  thesis: ParsedThesis;
  sources: SourceCheck[];
  /** Absent on sample briefs and briefs saved before snapshots existed. */
  snapshot?: ResearchSnapshot;
  evidence: Evidence[];
  assumptions: AssumptionEvaluation[];
  score: ThesisScore;
  verdict: Verdict;
  verdictSummary: string;
  invalidation: InvalidationCondition[];
  conclusion: {
    strongestFor: string;
    strongestAgainst: string;
    summary: string;
  };
}

// ─── Narrative Radar ─────────────────────────────────────────────────────────
// Radar readings and snapshots live in lib/radar/types.ts.

/** Deterministic lifecycle stage (see lib/radar/engine.ts). A description, never a prediction. */
export type NarrativeState =
  | "EMERGING"
  | "ACCELERATING"
  | "CROWDED"
  | "EXHAUSTING"
  | "FADING"
  | "STABLE";
