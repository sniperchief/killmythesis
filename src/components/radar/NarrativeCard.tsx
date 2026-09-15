import Link from "next/link";
import { monoMeta } from "@/components/ui/styles";
import { fmtPct, fmtPts, fmtShare } from "@/lib/radar/engine";
import type { NarrativeReading } from "@/lib/radar/types";
import { Sparkline } from "./Sparkline";
import { signTone, StageText } from "./Stage";

/** A classified narrative as a card. Used on the radar page and the homepage teaser. */
export function NarrativeCard({
  reading,
  rank,
  detailed = false,
  className = "bg-paper hover:bg-surface",
}: {
  reading: NarrativeReading;
  rank: number;
  detailed?: boolean;
  className?: string;
}) {
  const m = reading.metrics;
  return (
    <Link href={`/radar/${reading.id}`} className={`group flex h-full flex-col p-5 transition-colors ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] text-faint">{String(rank).padStart(2, "0")}</span>
        <StageText reading={reading} />
      </div>
      <div className={`mt-4 font-medium leading-tight ${detailed ? "text-[22px] tracking-[-0.01em]" : "text-[18px]"}`}>
        {reading.name}
      </div>
      {detailed && <p className="mt-2 text-[13.5px] leading-snug text-muted">{reading.description}</p>}
      <div className="mt-4">
        <Sparkline values={reading.trend} width={200} height={40} className="h-10 max-w-none" />
      </div>
      {m && (
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
          {[
            ["7D median", fmtPct(m.median7d), signTone(m.median7d)],
            ["Breadth", fmtShare(m.breadth), ""],
            ["vs BTC", fmtPts(m.relative7d), signTone(m.relative7d)],
          ].map(([label, value, tone]) => (
            <div key={label}>
              <dt className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">{label}</dt>
              <dd className={`mt-1 whitespace-nowrap font-mono text-[12.5px] tabular-nums ${tone}`}>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className={`mt-auto flex items-center justify-between gap-3 pt-4 text-muted ${monoMeta}`}>
        <span>{detailed && reading.confidence ? `Confidence ${reading.confidence.level}` : ""}</span>
        <span className="transition-colors group-hover:text-accent">Investigate →</span>
      </div>
    </Link>
  );
}
