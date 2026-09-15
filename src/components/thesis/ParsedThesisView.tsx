import { Label, ToneBadge } from "@/components/ui/primitives";
import { pad2 } from "@/lib/format";
import { RESULT_META } from "@/lib/labels";
import type { AssumptionEvaluation, ParsedThesis } from "@/lib/types";

export function ParsedThesisView({
  thesis,
  evaluations,
}: {
  thesis: ParsedThesis;
  evaluations?: AssumptionEvaluation[];
}) {
  return (
    <div>
      <Label>Your thesis</Label>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[30px] font-semibold leading-none tracking-[-0.02em]">{thesis.subject}</span>
        <span className="font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-ink-soft">
          — {thesis.stance}
        </span>
        {thesis.horizon && <span className="font-mono text-[11px] text-muted">{thesis.horizon}</span>}
      </div>

      <Label className="mt-5">Core thesis</Label>
      <p className="mt-1.5 text-[15px] leading-relaxed">“{thesis.coreThesis}”</p>

      <Label className="mt-7">Assumptions under test</Label>
      <ol className="mt-2 divide-y divide-line border-y border-line">
        {thesis.assumptions.map((assumption, i) => {
          const evaluation = evaluations?.find((e) => e.assumptionId === assumption.id);
          return (
            <li key={assumption.id} className="flex gap-4 py-3">
              <span className="pt-0.5 font-mono text-[12px] font-medium text-accent">{pad2(i + 1)}</span>
              <div className="flex-1">
                <p className="text-[14px] leading-snug">{assumption.text}</p>
                {evaluation && (
                  <div className="mt-2">
                    <ToneBadge tone={RESULT_META[evaluation.result].tone}>{RESULT_META[evaluation.result].label}</ToneBadge>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
