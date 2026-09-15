/**
 * Phase 1 preview runner: replays the research event sequence with SAMPLE
 * fixtures so the workflow UI can be built before the live pipeline exists.
 * It ignores the user's input (it cannot parse it) and the UI says so.
 */
import { DIMENSION_ORDER } from "@/lib/dimensions";
import type { ResearchRunner } from "@/lib/research/run-state";
import { SAMPLE_SOURCES, SAMPLE_THESIS, buildSampleBrief } from "./sample-fixtures";

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export const previewRunner: ResearchRunner = async (_input, emit, signal) => {
  await wait(700, signal);
  emit({ type: "parsed", thesis: SAMPLE_THESIS, plan: DIMENSION_ORDER });

  await wait(300, signal);
  for (const check of SAMPLE_SOURCES) emit({ type: "source", check: { dimension: check.dimension, status: "running" } });
  for (const check of SAMPLE_SOURCES) {
    await wait(350, signal);
    emit({ type: "source", check });
  }

  emit({ type: "evaluating" });
  await wait(800, signal);
  emit({ type: "brief", brief: buildSampleBrief() });
};
