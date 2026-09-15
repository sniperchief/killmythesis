/**
 * Narrative Radar → KillMyThesis handoff.
 *
 * The URL carries only the thesis text and the narrative id. The research request sends
 * the id, and the server resolves the narrative's assets, metrics and lifecycle itself,
 * so no market data is ever taken from the URL.
 */
import { getNarrativeDefinition } from "./taxonomy";

export interface NarrativeHandoff {
  id: string;
  name: string;
  assets: string[];
}

export const MAX_HANDOFF_THESIS = 2000;

/** The KillMyThesis workspace. The home page is a landing page. */
export const THESIS_PATH = "/thesis";

/** `run` launches research immediately; it is only used after the user has seen and confirmed the thesis. */
export function handoffHref(narrativeId: string, thesis: string, run = false): string {
  const params = new URLSearchParams({ thesis: thesis.slice(0, MAX_HANDOFF_THESIS), narrative: narrativeId });
  if (run) params.set("run", "1");
  return `${THESIS_PATH}?${params.toString()}`;
}

type SearchParams = Record<string, string | string[] | undefined>;

export function parseHandoff(params: SearchParams): { thesis: string; autoRun: boolean; narrative: NarrativeHandoff | null } {
  const thesis = typeof params.thesis === "string" ? params.thesis.slice(0, MAX_HANDOFF_THESIS) : "";
  const definition = typeof params.narrative === "string" ? getNarrativeDefinition(params.narrative) : null;
  return {
    thesis,
    autoRun: params.run === "1" && thesis.trim().length > 0,
    narrative: definition ? { id: definition.id, name: definition.name, assets: definition.assets } : null,
  };
}
