"use client";

import Link from "next/link";
import { Label, ToneBadge } from "@/components/ui/primitives";
import { buttonPrimary, buttonSecondary, monoMeta } from "@/components/ui/styles";
import { formatShortDate } from "@/lib/format";
import { clearHistory, useHistory } from "@/lib/history";
import { VERDICT_META } from "@/lib/labels";
import { useHydrated } from "@/lib/useHydrated";

const excerpt = (text: string, max = 90) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

export function HistoryList() {
  const entries = useHistory();
  const hydrated = useHydrated();

  if (!hydrated) return <div className="h-40 border border-line bg-surface" />;

  if (entries.length === 0) {
    return (
      <div className="border border-line bg-surface px-6 py-12 text-center">
        <Label>No saved research yet</Label>
        <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-ink-soft">
          Completed research from the live engine is saved here automatically. Sample previews are never saved.
        </p>
        <Link href="/thesis" className={`${buttonPrimary} mt-6`}>
          Kill a thesis
        </Link>
      </div>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-line border-y border-line">
        {entries.map((entry) => {
          const { brief } = entry;
          const origin = brief.origin;
          return (
            <li key={entry.id}>
              <Link
                href={`/research/${encodeURIComponent(entry.id)}`}
                className="group grid grid-cols-[4.5rem_1fr] items-baseline gap-x-4 gap-y-1.5 py-4 transition-colors hover:bg-surface sm:grid-cols-[5.5rem_1fr_auto_5rem]"
              >
                <span className="font-mono text-[12px] text-muted">{formatShortDate(entry.createdAt)}</span>
                <span className="min-w-0">
                  <span className="block text-[16px] font-medium group-hover:text-ink">
                    {origin ? origin.narrativeName : entry.title}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft">
                    {origin && <span className={`mr-1.5 text-accent ${monoMeta}`}>Narrative Radar →</span>}“
                    {excerpt(brief.thesis.raw)}”
                  </span>
                </span>
                <span className="col-start-2 flex items-center gap-3 sm:col-start-auto">
                  <ToneBadge tone={VERDICT_META[brief.verdict].tone}>{entry.label}</ToneBadge>
                  <span className="font-mono text-[12px] tabular-nums text-ink-soft sm:hidden">
                    {Math.round(brief.score.total)}/100
                  </span>
                </span>
                <span className="hidden text-right font-mono text-[12px] tabular-nums text-ink-soft sm:block">
                  {Math.round(brief.score.total)}/100
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => {
          if (window.confirm("Clear all saved research from this browser?")) clearHistory();
        }}
        className={`${buttonSecondary} mt-6`}
      >
        Clear history
      </button>
    </div>
  );
}
