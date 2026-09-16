import Link from "next/link";
import { Label, ToneBadge } from "@/components/ui/primitives";
import { monoMeta } from "@/components/ui/styles";
import { coverageSummary } from "@/lib/coverage";
import { formatDateTime } from "@/lib/format";
import { NARRATIVE_STATE_META, TONE_TEXT, VERDICT_META } from "@/lib/labels";
import type { ResearchBrief } from "@/lib/types";
import { AssumptionCheck } from "./AssumptionCheck";
import { DataUsedView } from "./DataUsed";
import { EvidenceColumns, EvidenceLog } from "./Evidence";
import { InvalidationView } from "./Invalidation";
import { HistoricalStressTest } from "./HistoricalStressTest";
import { ThesisScorePanel } from "./ThesisScorePanel";

export function ResearchBriefView({ brief }: { brief: ResearchBrief }) {
  const verdict = VERDICT_META[brief.verdict];
  const coverage = coverageSummary(brief.sources);

  return (
    <article className="space-y-12">
      <header className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-muted ${monoMeta}`}>
        <span className="text-ink">Research brief</span>
        <span>{formatDateTime(brief.createdAt)}</span>
        {brief.mode === "sample" && <ToneBadge tone="caution">Sample</ToneBadge>}
        {brief.origin && (
          <span>
            From Narrative Radar ·{" "}
            <Link href={`/radar/${brief.origin.narrativeId}`} className="text-ink underline decoration-accent underline-offset-2">
              {brief.origin.narrativeName}
            </Link>
            {brief.origin.lifecycle && ` · ${NARRATIVE_STATE_META[brief.origin.lifecycle].label} at handoff`}
          </span>
        )}
        {coverage && <span className="w-full font-sans text-[12.5px] normal-case tracking-normal">{coverage}</span>}
      </header>

      <section className="-mt-6 grid gap-8 border border-line bg-surface p-6 md:grid-cols-[1fr_260px] md:gap-6">
        <div>
          <Label>Thesis verdict</Label>
          <div
            className={`mt-3 text-[30px] font-semibold uppercase leading-[0.95] tracking-[-0.02em] sm:text-[38px] ${TONE_TEXT[verdict.tone]}`}
          >
            {verdict.label}
          </div>
          <p className="mt-5 max-w-prose text-[16px] leading-relaxed text-ink-soft">{brief.verdictSummary}</p>
        </div>
        <ThesisScorePanel score={brief.score} />
      </section>

      <DataUsedView brief={brief} />

      <EvidenceColumns brief={brief} />

      <AssumptionCheck brief={brief} />

      <InvalidationView brief={brief} />

      <section className="border border-ink bg-surface p-6">
        <Label className="text-ink">Research conclusion</Label>
        <p className="mt-3 text-[17px] leading-relaxed">{brief.conclusion.summary}</p>
        <dl className="mt-6 grid gap-6 border-t border-line pt-5 sm:grid-cols-2">
          <div>
            <dt className={`text-support ${monoMeta}`}>Strongest argument for</dt>
            <dd className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{brief.conclusion.strongestFor}</dd>
          </div>
          <div>
            <dt className={`text-challenge ${monoMeta}`}>Strongest argument against</dt>
            <dd className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{brief.conclusion.strongestAgainst}</dd>
          </div>
        </dl>
        <p className={`mt-6 border-t border-line pt-4 text-muted ${monoMeta}`}>
          The decision is yours · KillMyThesis does not make trade recommendations
        </p>
      </section>

      <HistoricalStressTest thesis={brief.thesis} />

      <EvidenceLog brief={brief} />
    </article>
  );
}
