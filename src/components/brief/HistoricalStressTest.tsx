import { Label, ToneBadge } from "@/components/ui/primitives";
import type { ParsedThesis } from "@/lib/types";

/**
 * HISTORICAL STRESS TEST — future module (interface only in V1).
 *
 * Will answer: "When the market previously looked like this, what happened next?"
 * It intentionally renders no results until a real historical engine exists
 * (candidate: the Bitget Signal MCP `backtest` tool). Never add placeholder outcomes.
 */
export function HistoricalStressTest({ thesis }: { thesis: ParsedThesis }) {
  return (
    <section className="border border-dashed border-line-strong p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Label>Historical stress test</Label>
        <ToneBadge tone="neutral">Not yet available</ToneBadge>
      </div>
      <p className="mt-3 text-[15px] font-medium leading-snug">
        “When {thesis.subject} previously looked like this, what happened next?”
      </p>
      <p className="mt-1.5 text-[13px] text-muted">
        The historical engine is not connected yet, so no historical results are shown.
      </p>
    </section>
  );
}
