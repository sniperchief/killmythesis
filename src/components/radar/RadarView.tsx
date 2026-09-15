import Link from "next/link";
import type { ReactNode } from "react";
import { Label, SampleNotice, ToneBadge } from "@/components/ui/primitives";
import { PAGE, monoMeta } from "@/components/ui/styles";
import { NARRATIVE_STATE_META, NARRATIVE_STATE_ORDER } from "@/lib/labels";
import { RADAR_RULES, fmtFunding, fmtPct, fmtPts, fmtShare } from "@/lib/radar/engine";
import type { NarrativeReading, RadarSnapshot } from "@/lib/radar/types";
import { Freshness } from "./Freshness";
import { NarrativeCard } from "./NarrativeCard";
import { Sparkline } from "./Sparkline";
import { signTone, StageText } from "./Stage";

export { signTone, StageText } from "./Stage";

const LOOP = ["Discover", "Investigate", "Form thesis", "Kill thesis", "Decide"];
const COLS = "lg:grid-cols-[2.5rem_minmax(0,1.6fr)_7.5rem_7rem_5rem_6rem_6rem_1rem]";
const FEATURED = 3;

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className={`text-faint lg:hidden ${monoMeta}`}>{label}</div>
      <div className="mt-0.5 whitespace-nowrap font-mono text-[13px] tabular-nums lg:mt-0">{children}</div>
    </div>
  );
}

function NarrativeRow({ reading, rank }: { reading: NarrativeReading; rank: number }) {
  const m = reading.metrics;
  return (
    <li>
      <Link
        href={`/radar/${reading.id}`}
        className={`group block px-4 py-4 transition-colors hover:bg-paper sm:px-5 lg:grid ${COLS} lg:items-center lg:gap-5`}
      >
        <span className="hidden font-mono text-[11px] text-faint lg:block">{String(rank).padStart(2, "0")}</span>
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[16px] font-medium">{reading.name}</div>
            <div className="mt-0.5 font-mono text-[10.5px] text-faint">
              {reading.coverage.available}/{reading.coverage.configured} assets
              {reading.coverage.level === "reduced" && <span className="text-caution"> · reduced coverage</span>}
              {reading.coverage.level === "insufficient" && <span className="text-caution"> · not enough data</span>}
            </div>
          </div>
          <StageText reading={reading} className="shrink-0 lg:hidden" />
        </div>
        <StageText reading={reading} className="hidden lg:block" />
        <div className="mt-3 grid grid-cols-[1fr_1fr_1fr_4.5rem] items-end gap-3 lg:contents">
          <Cell label="Momentum 7D">
            {m ? (
              <>
                <span className="mr-1.5 text-ink-soft" aria-hidden>
                  {reading.momentum}
                </span>
                <span className={signTone(m.median7d)}>{fmtPct(m.median7d)}</span>
              </>
            ) : (
              "—"
            )}
          </Cell>
          <Cell label="Breadth">{m ? fmtShare(m.breadth) : "—"}</Cell>
          <Cell label="vs BTC 7D">{m ? <span className={signTone(m.relative7d)}>{fmtPts(m.relative7d)}</span> : "—"}</Cell>
          <Sparkline values={reading.trend} />
        </div>
        <span className="hidden font-mono text-muted transition-colors group-hover:text-accent lg:block">→</span>
      </Link>
    </li>
  );
}

function Stat({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return (
    <div className="border-b border-r border-line bg-surface p-5">
      <div className={`text-muted ${monoMeta}`}>{label}</div>
      <div className="mt-2 font-display text-[24px] font-bold tracking-[-0.02em] tabular-nums sm:text-[28px]">{children}</div>
      {note && <div className="mt-1 text-[12px] text-muted">{note}</div>}
    </div>
  );
}

function SectionHeading({ label, title, children }: { label: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Label>{label}</Label>
        <h2 className="mt-3 font-display text-[28px] font-bold leading-none tracking-[-0.025em] sm:text-[36px]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

const RULES: [string, string][] = [
  ["Accelerating", `Relative performance ≥ ${fmtPts(RADAR_RULES.strongRelative7d)} with ≥ ${fmtShare(RADAR_RULES.strongParticipation)} of assets beating BTC, and no week-over-week deterioration.`],
  ["Emerging", `Relative momentum up ≥ ${RADAR_RULES.momentumShift} pts or participation up ≥ ${fmtShare(RADAR_RULES.participationShift)} week over week, positive relative performance, ≥ 50% beating BTC, and no 30-day run of ${fmtPts(RADAR_RULES.extendedRelative30d)} yet.`],
  ["Crowded", `Strong 7-day performance after a ≥ ${fmtPts(RADAR_RULES.extendedRelative30d)} 30-day run, with median funding ≥ ${fmtFunding(RADAR_RULES.fundingElevated8h)} per 8h or median volume ≥ ${fmtPct(RADAR_RULES.volumeSurge)}.`],
  ["Exhausting", `Still strong or extended, but relative momentum slowed ≥ ${RADAR_RULES.momentumShift} pts or participation fell ≥ ${fmtShare(RADAR_RULES.participationShift)} week over week.`],
  ["Fading", `Relative performance ≤ ${fmtPts(RADAR_RULES.weakRelative7d)} with ≤ ${fmtShare(RADAR_RULES.weakParticipation)} of assets beating BTC, or negative and deteriorating.`],
  ["Stable", "None of the above."],
  ["Coverage", `Below ${fmtShare(RADAR_RULES.coverage.insufficientBelow)} of tracked assets (or fewer than ${RADAR_RULES.coverage.minAssets}) → not classified; below ${fmtShare(RADAR_RULES.coverage.reducedBelow)} → reduced data confidence.`],
];

export function RadarView({ snapshot }: { snapshot: RadarSnapshot }) {
  const classified = snapshot.narratives.filter((n) => n.lifecycle);
  const featured = classified.filter((n) => n.metrics).slice(0, FEATURED);
  const b = snapshot.benchmark;

  return (
    <div className={`${PAGE} pb-20 pt-10 sm:pt-14`}>
      <header className="grid gap-6 border-b border-line pb-10 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-7">
          <Label>Narrative radar</Label>
          <h1 className="mt-4 font-display text-[40px] font-bold leading-[1] tracking-[-0.035em] sm:text-[58px]">
            See where the market is moving.
          </h1>
        </div>
        <div className="lg:col-span-5">
          <p className="text-[15.5px] leading-relaxed text-ink-soft">
            Momentum and participation across {snapshot.narratives.length} market narratives, measured from Bitget
            market data. Find a narrative worth investigating, then turn it into a thesis and try to kill it.
          </p>
          <ol className={`mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted ${monoMeta}`}>
            {LOOP.map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className={i === 0 ? "text-ink" : ""}>{step}</span>
                {i < LOOP.length - 1 && <span className="text-accent">→</span>}
              </li>
            ))}
          </ol>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-2 border-l border-t border-line lg:grid-cols-4">
        <Stat label="Market data" note="Bitget daily candles, cached briefly">
          <Freshness iso={snapshot.generatedAt} />
        </Stat>
        <Stat label="Assets covered" note="returned usable data">
          {snapshot.assetsAvailable}/{snapshot.assetsConfigured}
        </Stat>
        <Stat label="Classified" note="narratives with enough data">
          {classified.length}/{snapshot.narratives.length}
        </Stat>
        <Stat label="Benchmark · BTC 7D" note={b ? `30D ${fmtPct(b.return30d)}` : "unavailable"}>
          {b ? <span className={signTone(b.return7d)}>{fmtPct(b.return7d)}</span> : "—"}
        </Stat>
      </div>
      <p className="mt-3 max-w-3xl text-[12.5px] leading-relaxed text-muted">
        Classification uses Bitget spot price and volume, plus perpetual funding and open interest where available
        {snapshot.positioningNote ? ` (${snapshot.positioningNote.replace(/\.$/, "")})` : ""}. News, sentiment and
        on-chain data are not part of the radar. Stages describe observed behavior; they are not predictions or trade
        signals.
      </p>

      {snapshot.mode === "sample" && (
        <SampleNotice className="mt-6">
          Synthetic candles run through the real radar engine to build the interface. None of these readings are
          market data.
        </SampleNotice>
      )}

      {!b && (
        <div role="alert" className="mt-6 border border-challenge/30 bg-challenge-wash p-5">
          <Label className="text-challenge">Market data unavailable</Label>
          <p className="mt-2 text-[14.5px]">
            The BTC benchmark could not be loaded ({snapshot.benchmarkError}), so relative performance cannot be measured
            and no narrative is classified. Nothing was estimated or filled in.
          </p>
          <p className="mt-1 text-[13px] text-muted">Reload the page to retry.</p>
        </div>
      )}

      {featured.length > 0 && (
        <section className="mt-16">
          <SectionHeading label="Where to look first" title="Top of the radar right now." />
          <ol className="mt-8 grid border-l border-t border-line md:grid-cols-3">
            {featured.map((reading, i) => (
              <li key={reading.id} className="border-b border-r border-line">
                <NarrativeCard reading={reading} rank={i + 1} detailed className="bg-surface hover:bg-paper" />
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-16">
        <SectionHeading label="All narratives" title="The full ranking.">
          <span className={`text-muted ${monoMeta}`}>Ranked by stage, then size of the move vs BTC</span>
        </SectionHeading>
        <div className="mt-8 border border-ink bg-surface">
          <div className={`hidden gap-5 bg-ink px-5 py-3 text-paper/80 lg:grid ${COLS} ${monoMeta}`}>
            <span>#</span>
            <span>Narrative</span>
            <span>Stage</span>
            <span>Momentum 7D</span>
            <span>Breadth</span>
            <span>vs BTC 7D</span>
            <span>Trend 30D</span>
            <span />
          </div>
          <ul className="divide-y divide-line">
            {snapshot.narratives.map((reading, i) => (
              <NarrativeRow key={reading.id} reading={reading} rank={i + 1} />
            ))}
          </ul>
        </div>
        <p className="mt-3 text-[12px] text-muted">
          Each narrative is measured through a basket of representative assets, not every token in the sector.
        </p>
      </section>

      <section className="mt-16 grid gap-8 bg-ink p-6 text-paper sm:p-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className={`text-accent ${monoMeta}`}>How the radar classifies</div>
          <h2 className="mt-3 font-display text-[28px] font-bold leading-[1.05] tracking-[-0.025em] sm:text-[34px]">
            Fixed rules. No AI in the classification.
          </h2>
          <p className="mt-4 text-[14px] leading-relaxed text-paper/65">
            Relative performance is the median 7-day return of a narrative’s assets minus BTC’s. Breadth is the share
            of assets up over 7 days; participation is the share beating BTC. The first rule that matches sets the
            stage.
          </p>
        </div>
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:col-span-8">
          {RULES.map(([name, rule]) => (
            <div key={name} className="border-t border-paper/15 pt-3">
              <dt className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-paper">{name}</dt>
              <dd className="mt-1.5 text-[13px] leading-relaxed text-paper/70">{rule}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-16">
        <SectionHeading label="Lifecycle stages" title="What each stage means." />
        <dl className="mt-8 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-3">
          {NARRATIVE_STATE_ORDER.map((state) => {
            const meta = NARRATIVE_STATE_META[state];
            const count = classified.filter((n) => n.lifecycle === state).length;
            return (
              <div key={state} className="border-b border-r border-line bg-surface p-5">
                <dt className="flex items-center justify-between gap-3">
                  <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>
                  <span className={`text-muted ${monoMeta}`}>
                    {count} {count === 1 ? "narrative" : "narratives"} now
                  </span>
                </dt>
                <dd className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">{meta.description}</dd>
              </div>
            );
          })}
        </dl>
      </section>
    </div>
  );
}
