import { Label, ToneBadge } from "@/components/ui/primitives";
import { monoMeta } from "@/components/ui/styles";
import { DIMENSIONS } from "@/lib/dimensions";
import { assumptionNumber, formatDateTime, formatUnit } from "@/lib/format";
import { weightOf } from "@/lib/scoring";
import { safeVerifyLink } from "@/lib/verify";
import type { Evidence, EvidenceDirection } from "@/lib/types";

const DIRECTION_TONE = { supporting: "support", challenging: "challenge", neutral: "neutral" } as const;

export function EvidenceCard({
  evidence,
  assumptionIds,
  showDirection = false,
}: {
  evidence: Evidence;
  assumptionIds: string[];
  showDirection?: boolean;
}) {
  const verify = safeVerifyLink(evidence.verify);
  return (
    <li className="border-t border-line py-4 first:border-t-0">
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-muted ${monoMeta}`}>
        {showDirection && <ToneBadge tone={DIRECTION_TONE[evidence.direction]}>{evidence.direction}</ToneBadge>}
        <span>{DIMENSIONS[evidence.dimension].label}</span>
        <span className="text-faint">·</span>
        <span>{evidence.topic}</span>
        {evidence.assumptionIds.map((id) => (
          <span key={id} className="border border-line px-1 text-ink-soft" title="Linked assumption">
            {assumptionNumber(assumptionIds, id)}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[14.5px] font-medium leading-snug">{evidence.finding}</p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
        <span className="text-muted">Why it matters: </span>
        {evidence.explanation}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10.5px] text-faint">
        <span>{evidence.source}</span>
        <span>{evidence.timestamp ? formatDateTime(evidence.timestamp) : "no timestamp"}</span>
        <span>conf {formatUnit(evidence.confidence)}</span>
        <span>rel {formatUnit(evidence.relevance)}</span>
        {verify && (
          <a
            href={verify.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Check this data on ${verify.label}`}
            className="text-ink-soft underline decoration-accent underline-offset-2 hover:text-ink"
          >
            Verify · {verify.label} ↗
          </a>
        )}
      </div>
    </li>
  );
}

function strongest(evidence: Evidence[], direction: EvidenceDirection, limit = 4) {
  return evidence
    .filter((e) => e.direction === direction)
    .sort((a, b) => weightOf(b) - weightOf(a))
    .slice(0, limit);
}

interface EvidenceSource {
  evidence: Evidence[];
  thesis?: { assumptions: { id: string }[] };
}

export function EvidenceColumns({
  brief,
  labels = { supporting: "What supports the thesis", challenging: "What challenges the thesis" },
}: {
  brief: EvidenceSource;
  labels?: { supporting: string; challenging: string };
}) {
  const ids = brief.thesis?.assumptions.map((a) => a.id) ?? [];
  const columns = [
    { direction: "supporting" as const, title: labels.supporting, rule: "border-support" },
    { direction: "challenging" as const, title: labels.challenging, rule: "border-challenge" },
  ];

  return (
    <section className="grid gap-8 md:grid-cols-2">
      {columns.map((col) => {
        const items = strongest(brief.evidence, col.direction);
        const total = brief.evidence.filter((e) => e.direction === col.direction).length;
        return (
          <div key={col.direction} className={`border-t-2 ${col.rule}`}>
            <div className="flex items-baseline justify-between pt-3">
              <Label className="text-ink">{col.title}</Label>
              <span className="font-mono text-[11px] text-muted">
                {items.length < total ? `top ${items.length} of ${total}` : total}
              </span>
            </div>
            {items.length ? (
              <ul className="mt-1">
                {items.map((e) => (
                  <EvidenceCard key={e.id} evidence={e} assumptionIds={ids} />
                ))}
              </ul>
            ) : (
              <p className="py-4 text-[13.5px] text-muted">No evidence in this direction from the sources that responded.</p>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function EvidenceLog({ brief }: { brief: EvidenceSource }) {
  const ids = brief.thesis?.assumptions.map((a) => a.id) ?? [];
  return (
    <details className="group border-t border-line pt-4">
      <summary className="cursor-pointer list-none font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted hover:text-ink">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
        Full evidence log · {brief.evidence.length} items
      </summary>
      <ul className="mt-2">
        {brief.evidence.map((e) => (
          <EvidenceCard key={e.id} evidence={e} assumptionIds={ids} showDirection />
        ))}
      </ul>
    </details>
  );
}
