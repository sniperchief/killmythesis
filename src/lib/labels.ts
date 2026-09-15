import type { AssumptionResult, NarrativeState, Verdict } from "./types";

export type Tone = "support" | "challenge" | "caution" | "neutral";

export const TONE_TEXT: Record<Tone, string> = {
  support: "text-support",
  challenge: "text-challenge",
  caution: "text-caution",
  neutral: "text-ink-soft",
};

export const TONE_WASH: Record<Tone, string> = {
  support: "bg-support-wash text-support",
  challenge: "bg-challenge-wash text-challenge",
  caution: "bg-caution-wash text-caution",
  neutral: "bg-line/70 text-ink-soft",
};

export const VERDICT_META: Record<Verdict, { label: string; tone: Tone }> = {
  STRONGLY_SUPPORTED: { label: "Strongly supported", tone: "support" },
  SUPPORTED: { label: "Supported", tone: "support" },
  PARTIALLY_SUPPORTED: { label: "Partially supported", tone: "caution" },
  MIXED: { label: "Mixed evidence", tone: "caution" },
  WEAK: { label: "Weak support", tone: "challenge" },
  INSUFFICIENT_DATA: { label: "Insufficient data", tone: "neutral" },
};

export const RESULT_META: Record<AssumptionResult, { label: string; tone: Tone }> = {
  supported: { label: "Supported", tone: "support" },
  partially_supported: { label: "Partially supported", tone: "caution" },
  uncertain: { label: "Uncertain", tone: "neutral" },
  weak: { label: "Weak", tone: "challenge" },
  contradicted: { label: "Contradicted", tone: "challenge" },
  insufficient_data: { label: "No data", tone: "neutral" },
};

/** Descriptions, not predictions: CROWDED does not mean "will fall", EMERGING does not mean "buy". */
export const NARRATIVE_STATE_META: Record<NarrativeState, { label: string; tone: Tone; description: string }> = {
  ACCELERATING: {
    label: "Accelerating",
    tone: "support",
    description: "Strong relative momentum with broad participation that is not deteriorating.",
  },
  EMERGING: {
    label: "Emerging",
    tone: "support",
    description: "Early evidence of improving momentum and participation, before a large run.",
  },
  CROWDED: {
    label: "Crowded",
    tone: "caution",
    description: "Strong performance, with elevated funding or a volume surge suggesting heavy positioning.",
  },
  EXHAUSTING: {
    label: "Exhausting",
    tone: "caution",
    description: "Momentum still elevated, but participation or price confirmation is deteriorating.",
  },
  FADING: {
    label: "Fading",
    tone: "challenge",
    description: "Momentum and participation weakening relative to the market.",
  },
  STABLE: { label: "Stable", tone: "neutral", description: "No meaningful directional change relative to the market." },
};

/** Ranking priority on the radar: where to look first. */
export const NARRATIVE_STATE_ORDER: NarrativeState[] = [
  "ACCELERATING",
  "EMERGING",
  "CROWDED",
  "EXHAUSTING",
  "FADING",
  "STABLE",
];
