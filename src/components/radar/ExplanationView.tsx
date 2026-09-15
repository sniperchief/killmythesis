import { Label } from "@/components/ui/primitives";
import type { ExplanationResult } from "@/server/radar/explainer";

export type ExplanationPart = "why" | "wrong" | "next";

function Points({ title, items, glyph, tone }: { title: string; items: string[]; glyph: string; tone: string }) {
  return (
    <div className="mt-5">
      <Label>{title}</Label>
      <ul className="mt-2 border-t border-line">
        {items.map((item) => (
          <li key={item} className="grid grid-cols-[1.25rem_1fr] gap-x-2 border-b border-line py-2.5 text-[14px] leading-snug">
            <span className={`font-mono text-[13px] ${tone}`}>{glyph}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Renders one part of a validated AI explanation. Failures are shown once, in the "why" part. */
export function ExplanationView({ result, part }: { result: ExplanationResult; part: ExplanationPart }) {
  if (!result.ok) {
    if (part !== "why") return null;
    return (
      <div role="status" className="border border-caution/25 bg-caution-wash px-4 py-3">
        <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-caution">
          AI explanation unavailable
        </div>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">{result.message}</p>
        <p className="mt-1 text-[12.5px] text-muted">
          The metrics and classification on this page are calculated without AI and are unaffected.
        </p>
      </div>
    );
  }

  const { explanation, removed } = result;
  if (part === "why") {
    return (
      <div>
        <p className="text-[18px] leading-relaxed tracking-[-0.005em]">{explanation.summary}</p>
        {explanation.strongestEvidence.length > 0 && (
          <Points title="Strongest evidence" items={explanation.strongestEvidence} glyph="✓" tone="text-support" />
        )}
        <p className="mt-3 font-mono text-[10.5px] text-faint">
          AI interpretation of the calculated metrics · it cannot change the classification
          {removed > 0 && ` · ${removed} statement${removed === 1 ? "" : "s"} removed for citing data not in this reading`}
        </p>
      </div>
    );
  }
  if (part === "wrong") {
    return explanation.weakeningEvidence.length ? (
      <Points title="AI reading of the weak points" items={explanation.weakeningEvidence} glyph="×" tone="text-challenge" />
    ) : null;
  }
  return explanation.investigateNext.length ? (
    <Points title="What to investigate next" items={explanation.investigateNext} glyph="→" tone="text-accent" />
  ) : null;
}

export function ExplanationLoading() {
  return (
    <div className="flex items-center gap-3 border border-line bg-surface px-4 py-3 text-[13.5px] text-muted">
      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
      Writing an explanation from the calculated metrics…
    </div>
  );
}
