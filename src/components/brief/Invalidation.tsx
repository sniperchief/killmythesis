import { Label } from "@/components/ui/primitives";
import { monoMeta } from "@/components/ui/styles";
import { DIMENSIONS } from "@/lib/dimensions";
import { assumptionNumber } from "@/lib/format";
import type { ResearchBrief } from "@/lib/types";

export function InvalidationView({ brief }: { brief: ResearchBrief }) {
  const ids = brief.thesis.assumptions.map((a) => a.id);

  return (
    <section>
      <Label>What would invalidate this thesis</Label>
      {brief.invalidation.length === 0 ? (
        <p className="mt-3 border border-line bg-surface px-4 py-3 text-[13.5px] leading-relaxed text-ink-soft">
          No measurable invalidation condition could be set: none of the metrics it would watch returned data in this run.
          Nothing was estimated.
        </p>
      ) : (
        <ul className="mt-3 border-t border-line">
          {brief.invalidation.map((item) => (
            <li key={item.condition} className="grid grid-cols-[1.5rem_1fr] gap-x-2 border-b border-line py-4 sm:gap-x-4">
              <span className="font-mono text-[13px] text-challenge">×</span>
              <div className="min-w-0">
                <p className="text-[14.5px] font-medium leading-snug">{item.condition}</p>
                <div className={`mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted ${monoMeta}`}>
                  <span>{DIMENSIONS[item.dimension].label}</span>
                  {item.assumptionIds?.map((id) => (
                    <span key={id} className="border border-line px-1 text-ink-soft" title="Assumption it would break">
                      {assumptionNumber(ids, id)}
                    </span>
                  ))}
                </div>
                {item.rationale && <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{item.rationale}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        Conditions to monitor, not predictions. Every value comes from the data used, and thresholds are the metric’s
        own neutral line (zero, 50%, 1.00×) or a level read from the data, never chosen by the AI.
      </p>
    </section>
  );
}
