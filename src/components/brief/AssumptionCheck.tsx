import { Label, ToneBadge } from "@/components/ui/primitives";
import { monoMeta } from "@/components/ui/styles";
import { pad2 } from "@/lib/format";
import { RESULT_META } from "@/lib/labels";
import type { ResearchBrief } from "@/lib/types";

export function AssumptionCheck({ brief }: { brief: ResearchBrief }) {
  return (
    <section>
      <Label>Assumption check</Label>
      <div className="mt-3 border border-line bg-surface">
        <div
          className={`hidden grid-cols-[2.5rem_1fr_5.5rem_10rem] gap-4 border-b border-line px-4 py-2.5 text-muted sm:grid ${monoMeta}`}
        >
          <span>#</span>
          <span>Assumption</span>
          <span>For / against</span>
          <span className="text-right">Result</span>
        </div>
        <ul className="divide-y divide-line">
          {brief.thesis.assumptions.map((assumption, i) => {
            const evaluation = brief.assumptions.find((a) => a.assumptionId === assumption.id);
            const meta = evaluation ? RESULT_META[evaluation.result] : RESULT_META.insufficient_data;
            return (
              <li
                key={assumption.id}
                className="grid grid-cols-[2.5rem_1fr] gap-x-4 gap-y-2 px-4 py-4 sm:grid-cols-[2.5rem_1fr_5.5rem_10rem]"
              >
                <span className="font-mono text-[12px] font-medium text-accent">{pad2(i + 1)}</span>
                <div>
                  <p className="text-[14.5px] font-medium leading-snug">{assumption.text}</p>
                  {evaluation?.reasoning && (
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">{evaluation.reasoning}</p>
                  )}
                </div>
                <span className="col-start-2 font-mono text-[12px] tabular-nums sm:col-start-auto">
                  <span className="text-support">{evaluation?.supportingIds.length ?? 0}</span>
                  <span className="text-faint"> / </span>
                  <span className="text-challenge">{evaluation?.challengingIds.length ?? 0}</span>
                  <span className="ml-1.5 text-faint sm:hidden">for / against</span>
                </span>
                <span className="col-start-2 sm:col-start-auto sm:text-right">
                  <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
