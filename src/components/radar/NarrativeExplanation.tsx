import type { NarrativeReading, RadarSnapshot } from "@/lib/radar/types";
import { getNarrativeExplanation } from "@/server/radar/explainer";
import { ExplanationView, type ExplanationPart } from "./ExplanationView";

/** Server component. All parts share one cached explanation per narrative and snapshot. */
export async function NarrativeExplanation({
  reading,
  snapshot,
  part,
}: {
  reading: NarrativeReading;
  snapshot: RadarSnapshot;
  part: ExplanationPart;
}) {
  if (snapshot.mode === "sample") {
    return (
      <ExplanationView
        part={part}
        result={{ ok: false, reason: "not_configured", message: "AI explanations are only generated from live market data." }}
      />
    );
  }
  return <ExplanationView part={part} result={await getNarrativeExplanation(reading, snapshot)} />;
}
