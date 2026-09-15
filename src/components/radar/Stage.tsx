import { NARRATIVE_STATE_META, TONE_TEXT } from "@/lib/labels";
import type { NarrativeReading } from "@/lib/radar/types";

/** Green for positive, red for negative, neutral within ±0.05. */
export const signTone = (n: number) => (n >= 0.05 ? "text-support" : n <= -0.05 ? "text-challenge" : "text-ink-soft");

export function StageText({ reading, className = "" }: { reading: NarrativeReading; className?: string }) {
  if (!reading.lifecycle) {
    return <span className={`font-mono text-[11px] uppercase tracking-[0.1em] text-muted ${className}`}>Insufficient data</span>;
  }
  const meta = NARRATIVE_STATE_META[reading.lifecycle];
  return (
    <span className={`font-mono text-[12px] font-semibold uppercase tracking-[0.12em] ${TONE_TEXT[meta.tone]} ${className}`}>
      {meta.label}
    </span>
  );
}
