import type { RadarSnapshot } from "@/lib/radar/types";
import type { DimensionId, VerifyLink } from "@/lib/types";
import type { BitgetRest } from "@/server/connectors/bitget-rest";
import type { PublicData } from "@/server/connectors/public-data";
import type { ConnectorFailure, ConnectorResult } from "@/server/connectors/types";
import type { StructuredLlm } from "@/server/llm/structured";

/**
 * A deterministic observation built from validated connector data.
 * The LLM may interpret a finding but can never change its text, source or timestamp.
 */
export interface RawFinding {
  id: string;
  dimension: DimensionId;
  source: string;
  topic: string;
  observation: string;
  timestamp: string | null;
  rawValue?: unknown;
  /** Set only where the data can actually be checked by a user. */
  verify?: VerifyLink;
}

export interface McpToolCaller {
  callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<ConnectorResult<unknown>>;
}

export type SubjectType = "asset" | "narrative" | "market";

/** What the planner hands each collector. */
export interface ResearchTarget {
  subject: string;
  subjectType: SubjectType;
  /** Bitget base tickers, e.g. ["SOL"]; a narrative basket may list several. */
  symbols: string[];
  newsKeywords: string[];
}

/** Shares identical connector calls (e.g. daily candles) across dimensions within one run. */
export type Memo = <T>(key: string, load: () => Promise<T>) => Promise<T>;

export interface CollectorContext {
  target: ResearchTarget;
  rest: BitgetRest;
  mcp: McpToolCaller;
  publicData: PublicData;
  memo: Memo;
  /** Collectors record every failed call here so the run can explain gaps. */
  failures: ConnectorFailure[];
}

export type Collector = (ctx: CollectorContext, signal: AbortSignal) => Promise<RawFinding[]>;

export interface DimensionOutcome {
  dimension: DimensionId;
  findings: RawFinding[];
  failures: ConnectorFailure[];
  /** Set when the dimension produced no usable findings. */
  unavailableNote?: string;
}

export interface ResearchDeps {
  llm: StructuredLlm;
  rest: BitgetRest;
  mcp: McpToolCaller;
  publicData: PublicData;
  /** Loads the cached Narrative Radar snapshot; only used for theses launched from a narrative. */
  radar?: () => Promise<RadarSnapshot>;
  now?: () => Date;
}
