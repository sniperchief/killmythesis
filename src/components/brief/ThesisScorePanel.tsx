import { Bar, Label } from "@/components/ui/primitives";
import type { ThesisScore } from "@/lib/types";

const COMPONENTS: { key: keyof Omit<ThesisScore, "total" | "coverage">; label: string; lowerIsBetter?: boolean }[] = [
  { key: "evidenceSupport", label: "Evidence support" },
  { key: "marketConfirmation", label: "Market confirmation" },
  { key: "contradictingEvidence", label: "Contradicting evidence", lowerIsBetter: true },
  { key: "keyAssumptionRisk", label: "Key assumption risk", lowerIsBetter: true },
];

export function ThesisScorePanel({ score }: { score: ThesisScore }) {
  return (
    <div className="border-t border-line pt-6 md:border-l md:border-t-0 md:pl-6 md:pt-0">
      <Label>Thesis strength</Label>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[46px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{score.total}</span>
        <span className="font-mono text-[13px] text-muted">/ 100</span>
      </div>
      <div className="mt-3">
        <Bar value={score.total} strong />
      </div>

      <dl className="mt-5 space-y-3">
        {COMPONENTS.map((c) => (
          <div key={c.key}>
            <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
              <dt className="text-ink-soft">
                {c.label}
                {c.lowerIsBetter && <span className="ml-1.5 font-mono text-[9.5px] text-faint">LOWER IS BETTER</span>}
              </dt>
              <dd className="font-mono tabular-nums">{score[c.key]}</dd>
            </div>
            <div className="mt-1">
              <Bar value={score[c.key]} />
            </div>
          </div>
        ))}
      </dl>

      <p className="mt-5 text-[11.5px] leading-snug text-muted">
        Internal research score, not a probability. Computed deterministically from evidence weights, assumption
        results and source coverage ({Math.round(score.coverage * 100)}%).
      </p>
    </div>
  );
}
