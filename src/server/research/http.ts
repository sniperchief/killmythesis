import { z } from "zod";
import { getNarrativeDefinition } from "@/lib/radar/taxonomy";
import type { ResearchEvent } from "@/lib/research/run-state";
import { createBitgetRest } from "@/server/connectors/bitget-rest";
import { SignalMcpClient } from "@/server/connectors/mcp-client";
import { createPublicData } from "@/server/connectors/public-data";
import { createDefaultLlm, LlmConfigError } from "@/server/llm/structured";
import { getRadarSnapshot } from "@/server/radar/snapshot";
import { runResearchSafely } from "./pipeline";
import type { ResearchDeps } from "./types";

/** `narrativeId` is only an id: the server resolves the narrative's context itself. */
const ResearchRequest = z.object({ thesis: z.string(), narrativeId: z.string().max(64).optional() });
export const MIN_THESIS_LENGTH = 8;
export const MAX_THESIS_LENGTH = 2000;

const jsonError = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export function createDefaultDeps(): ResearchDeps {
  return {
    llm: createDefaultLlm(),
    rest: createBitgetRest(),
    mcp: new SignalMcpClient(),
    publicData: createPublicData(),
    radar: getRadarSnapshot,
  };
}

type Runner = typeof runResearchSafely;

/**
 * POST /api/research — validates input, checks server configuration, then streams
 * newline-delimited ResearchEvents. Errors before streaming are JSON with a status.
 */
export async function handleResearchRequest(
  request: Request,
  makeDeps: () => ResearchDeps = createDefaultDeps,
  run: Runner = runResearchSafely,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Request body must be JSON.");
  }
  const parsed = ResearchRequest.safeParse(body);
  if (!parsed.success) return jsonError(400, "Request must include a thesis string.");

  const thesis = parsed.data.thesis.replace(/\s+/g, " ").trim();
  if (thesis.length < MIN_THESIS_LENGTH) return jsonError(400, "The thesis is too short to research.");
  if (thesis.length > MAX_THESIS_LENGTH) return jsonError(400, `The thesis must be under ${MAX_THESIS_LENGTH} characters.`);
  const { narrativeId } = parsed.data;
  if (narrativeId !== undefined && !getNarrativeDefinition(narrativeId)) return jsonError(400, "Unknown narrative.");

  let deps: ResearchDeps;
  try {
    deps = makeDeps();
  } catch (err) {
    if (err instanceof LlmConfigError) return jsonError(503, err.message);
    throw err;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ResearchEvent) => {
        if (!request.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      await run(thesis, emit, deps, request.signal, narrativeId ? { narrativeId } : {});
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
