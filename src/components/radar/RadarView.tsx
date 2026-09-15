import Link from "next/link";
import type { ReactNode } from "react";
import { Label, SampleNotice, ToneBadge } from "@/components/ui/primitives";
import { PAGE, monoMeta } from "@/components/ui/styles";
import { NARRATIVE_STATE_META, NARRATIVE_STATE_ORDER, TONE_TEXT } from "@/lib/labels";
import { RADAR_RULES, fmtFunding, fmtPct, fmtPts, fmtShare } from "@/lib/radar/engine";
import type { NarrativeReading, RadarSnapshot } from "@/lib/radar/types";
import { Freshness } from "./Freshness";
import { Sparkline } from "./Sparkline";

const LOOP = ["Discover", "Investigate", "Form thesis", "Kill thesis", "Decide"];
const COLS = "lg:grid-cols-[minmax(0,1.6fr)_7.5rem_7rem_5rem_6rem_6rem_1rem]";

export const signTone = (n: number) => (n >= 0.05 ? "text-support" : n <= -0.05 ? "text-challenge" : "text-ink-soft");

export function StageText({ reading, className = "" }: { reading: NarrativeReading; className?: string }) {
  if (!reading.lifecycle) {
    return <span className={`font-mono text-[11px] uppercase tracking-[0.1em] text-muted ${className}`}>Insufficient data</span>;
  }
  const meta = NARRATIVE_STATE_META[reading.lifecycle];
  return (
    <span className={`font-mono text-[12px] font-semibold uppercase tracking-[0.12em] ${TONE_TEXT[meta.tone]} ${className}`}>
      {meta.label}
    </span>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className={`text-faint lg:hidden ${monoMeta}`}>{label}</div>
      <div className="mt-0.5 whitespace-nowrap font-mono text-[13px] tabular-nums lg:mt-0">{children}</div>
    </div>
  );
}

function NarrativeRow({ reading }: { reading: NarrativeReading }) {
  const m = reading.metrics;
  return (
    <li>
      <Link
        href={`/radar/${reading.id}`}
        className={`group block px-4 py-4 transition-colors hover:bg-paper sm:px-5 lg:grid ${COLS} lg:items-center lg:gap-5`}
      >
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

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-faint">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

const RULES = [
  `Relative performance: median 7-day return of the tracked assets minus BTC's. Breadth: share of tracked assets up over 7 days. Participation: share beating BTC.`,
  `Accelerating: relative performance ≥ ${fmtPts(RADAR_RULES.strongRelative7d)} with ≥ ${fmtShare(RADAR_RULES.strongParticipation)} of assets beating BTC, and no week-over-week deterioration.`,
  `Emerging: relative momentum up ≥ ${RADAR_RULES.momentumShift} pts or participation up ≥ ${fmtShare(RADAR_RULES.participationShift)} week over week, positive relative performance, ≥ 50% beating BTC, and no 30-day run of ${fmtPts(RADAR_RULES.extendedRelative30d)} yet.`,
  `Crowded: accelerating-strength 7-day performance after a ≥ ${fmtPts(RADAR_RULES.extendedRelative30d)} 30-day run, with median funding ≥ ${fmtFunding(RADAR_RULES.fundingElevated8h)} per 8h or median volume ≥ ${fmtPct(RADAR_RULES.volumeSurge)}.`,
  `Exhausting: still strong or extended, but relative momentum slowed ≥ ${RADAR_RULES.momentumShift} pts or participation fell ≥ ${fmtShare(RADAR_RULES.participationShift)} week over week.`,
  `Fading: relative performance ≤ ${fmtPts(RADAR_RULES.weakRelative7d)} with ≤ ${fmtShare(RADAR_RULES.weakParticipation)} of assets beating BTC, or negative and deteriorating.`,
  `Stable: none of the above.`,
  `Coverage: below ${fmtShare(RADAR_RULES.coverage.insufficientBelow)} of tracked assets (or fewer than ${RADAR_RULES.coverage.minAssets}) → not classified; below ${fmtShare(RADAR_RULES.coverage.reducedBelow)} → reduced data confidence.`,
];

export function RadarView({ snapshot }: { snapshot: RadarSnapshot }) {
  const classified = snapshot.narratives.filter((n) => n.lifecycle).length;
  const b = snapshot.benchmark;

  return (
    <div className={`${PAGE} py-10 lg:py-14`}>
      <Label>Discover</Label>
      <h1 className="mt-4 text-[34px] font-semibold uppercase leading-none tracking-[-0.02em] sm:text-[48px]">Narrative radar</h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-soft">
        Find where market attention and participation are moving.
      </p>

      <ol className={`mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted ${monoMeta}`}>
        {LOOP.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span className={i === 0 ? "text-ink" : ""}>{step}</span>
            {i < LOOP.length - 1 && <span className="text-accent">→</span>}
          </li>
        ))}
      </ol>

      <dl className={`mt-8 flex flex-wrap gap-x-8 gap-y-2 border-y border-line py-3 ${monoMeta}`}>
        <Meta label="Market data">
          <Freshness iso={snapshot.generatedAt} />
        </Meta>
        <Meta label="Coverage">
          {snapshot.assetsAvailable}/{snapshot.assetsConfigured} assets · {classified}/{snapshot.narratives.length} classified
        </Meta>
        <Meta label="Benchmark">{b ? `BTC ${fmtPct(b.return7d)} 7D` : "BTC unavailable"}</Meta>
      </dl>
      <p className="mt-3 max-w-3xl text-[12.5px] leading-relaxed text-muted">
        Classification based on Bitget daily spot price and volume, with perpetual funding and open interest where
        available{snapshot.positioningNote ? ` (${snapshot.positioningNote.replace(/\.$/, "")})` : ""}. News, sentiment
        and on-chain coverage are not part of the radar. Stages describe observed behavior; they are not predictions or
        trade signals.
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

      <div className="mt-6 border border-line bg-surface">
        <div className={`hidden gap-5 border-b border-line px-5 py-2.5 text-muted lg:grid ${COLS} ${monoMeta}`}>
          <span>Narrative</span>
          <span>Stage</span>
          <span>Momentum 7D</span>
          <span>Breadth</span>
          <span>vs BTC 7D</span>
          <span>Trend 30D</span>
          <span />
        </div>
        <ul className="divide-y divide-line">
          {snapshot.narratives.map((reading) => (
            <NarrativeRow key={reading.id} reading={reading} />
          ))}
        </ul>
      </div>
      <p className="mt-2 text-[12px] text-muted">
        Ranked by stage, then by the size of the move relative to BTC. Each narrative is measured through a basket of
        representative assets, not every token in the sector.
      </p>

      <section className="mt-12">
        <Label>Lifecycle stages</Label>
        <dl className="mt-3 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-3">
          {NARRATIVE_STATE_ORDER.map((state) => {
            const meta = NARRATIVE_STATE_META[state];
            return (
              <div key={state} className="border-b border-r border-line p-4">
                <dt>
                  <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>
                </dt>
                <dd className="mt-2 text-[13px] leading-relaxed text-muted">{meta.description}</dd>
              </div>
            );
          })}
        </dl>
        <details className="group mt-4 border-t border-line pt-4">
          <summary className="cursor-pointer list-none font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted hover:text-ink">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
            How the radar classifies
          </summary>
          <ul className="mt-3 max-w-3xl space-y-2 text-[13px] leading-relaxed text-ink-soft">
            {RULES.map((rule) => (
              <li key={rule} className="border-l-2 border-line pl-3">
                {rule}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}
