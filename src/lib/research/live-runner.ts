import type { ResearchEvent, ResearchRunner } from "./run-state";

async function errorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error;
  } catch {
    // fall through to a status-based message
  }
  return res.status === 404 ? "The research engine is not connected." : `Research request failed (${res.status}).`;
}

const TERMINAL: ReadonlySet<ResearchEvent["type"]> = new Set(["brief", "error", "clarification"]);

/** Streams newline-delimited ResearchEvents from the server pipeline. */
export const liveRunner: ResearchRunner = async (input, emit, signal, options = {}) => {
  const res = await fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thesis: input, ...(options.narrativeId ? { narrativeId: options.narrativeId } : {}) }),
    signal,
  });

  if (!res.ok || !res.body) {
    emit({ type: "error", message: await errorMessage(res) });
    return;
  }

  let finished = false;
  const handle = (line: string) => {
    const event = JSON.parse(line) as ResearchEvent;
    if (TERMINAL.has(event.type)) finished = true;
    emit(event);
  };

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) handle(line);
    }
  }
  if (buffer.trim()) handle(buffer.trim());
  if (!finished) emit({ type: "error", message: "The research stream ended before a result was produced." });
};
