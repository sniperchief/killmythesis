import type { DimensionId, ParsedThesis, ResearchBrief, SourceCheck, ThesisClarification } from "@/lib/types";

/**
 * Events emitted by a research run. The live pipeline streams these as NDJSON
 * from /api/research; the sample runner emits the same events from labeled
 * fixtures, so the UI doesn't care which one is running.
 */
export type ResearchEvent =
  | { type: "parsed"; thesis: ParsedThesis; plan: DimensionId[] }
  | { type: "clarification"; clarification: ThesisClarification }
  | { type: "source"; check: SourceCheck }
  | { type: "evaluating" }
  | { type: "brief"; brief: ResearchBrief }
  | { type: "error"; message: string };

/** Extra research context. Only ids cross the network; the server resolves the data. */
export interface RunOptions {
  narrativeId?: string;
}

export type ResearchRunner = (
  input: string,
  emit: (event: ResearchEvent) => void,
  signal: AbortSignal,
  options?: RunOptions,
) => Promise<void>;

export type RunPhase = "idle" | "parsing" | "researching" | "evaluating" | "complete" | "needs_input" | "failed";

/** The Narrative Radar narrative a run was launched from, for display. */
export interface RunNarrative {
  id: string;
  name: string;
}

export interface RunState {
  phase: RunPhase;
  input: string;
  narrative: RunNarrative | null;
  thesis: ParsedThesis | null;
  clarification: ThesisClarification | null;
  sources: SourceCheck[];
  brief: ResearchBrief | null;
  error: string | null;
}

export const initialRunState: RunState = {
  phase: "idle",
  input: "",
  narrative: null,
  thesis: null,
  clarification: null,
  sources: [],
  brief: null,
  error: null,
};

export type RunAction = { type: "start"; input: string; narrative?: RunNarrative | null } | { type: "reset" } | ResearchEvent;

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case "start":
      return { ...initialRunState, phase: "parsing", input: action.input, narrative: action.narrative ?? null };
    case "reset":
      return initialRunState;
    case "parsed":
      return {
        ...state,
        phase: "researching",
        thesis: action.thesis,
        sources: action.plan.map((dimension) => ({ dimension, status: "queued" })),
      };
    case "clarification":
      return { ...state, phase: "needs_input", clarification: action.clarification };
    case "source":
      return {
        ...state,
        sources: state.sources.map((s) => (s.dimension === action.check.dimension ? action.check : s)),
      };
    case "evaluating":
      return { ...state, phase: "evaluating" };
    case "brief":
      return { ...state, phase: "complete", brief: action.brief, thesis: action.brief.thesis, sources: action.brief.sources };
    case "error":
      return { ...state, phase: "failed", error: action.message };
  }
}
