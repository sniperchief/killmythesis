import { previewRunner } from "@/lib/dev/preview-runner";
import type { DataMode } from "@/lib/types";
import { liveRunner } from "./live-runner";
import type { ResearchEvent, ResearchRunner } from "./run-state";

/** Live mode always uses the real pipeline. There is no fallback to sample research. */
export function selectRunner(mode: DataMode): ResearchRunner {
  return mode === "live" ? liveRunner : previewRunner;
}

/** A brief whose mode differs from the app's data mode is discarded, so sample and live never mix. */
export function enforceDataMode(mode: DataMode, event: ResearchEvent): ResearchEvent {
  if (event.type === "brief" && event.brief.mode !== mode) {
    return { type: "error", message: `Discarded a ${event.brief.mode} research result while running in ${mode} mode.` };
  }
  return event;
}
