import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Freshness } from "@/components/radar/Freshness";
import { NarrativeCard } from "@/components/radar/NarrativeCard";
import { Label, SampleNotice } from "@/components/ui/primitives";
import { PAGE, monoMeta } from "@/components/ui/styles";
import { DATA_MODE } from "@/lib/config";
import { buildSampleRadar } from "@/lib/dev/sample-radar";
import { NARRATIVES } from "@/lib/radar/taxonomy";
import type { RadarSnapshot } from "@/lib/radar/types";
import { getRadarSnapshot } from "@/server/radar/snapshot";

const SHOW = 4;

/** Live proof on the landing page. Streams in after the page shell; never shows placeholder readings. */
export function RadarTeaser() {
  return (
    <section className="border-t border-line bg-surface">
      <div className={`${PAGE} py-16 lg:py-24`}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <Label>Narrative radar · live</Label>
            <h2 className="mt-4 font-display text-[34px] font-bold leading-[1.02] tracking-[-0.03em] sm:text-[46px]">
              No idea yet? Start where the market is moving.
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-ink-soft">
              Narrative Radar measures momentum and participation across {NARRATIVES.length} market narratives from
              live Bitget data. Open one, form a thesis, then try to kill it.
            </p>
          </div>
          <Link
            href="/radar"
            className="text-[15px] font-medium text-ink underline decoration-accent decoration-2 underline-offset-[6px] hover:decoration-ink"
          >
            Open the full radar →
          </Link>
        </div>

        <Suspense fallback={<TeaserLoading />}>
          <TeaserReadings />
        </Suspense>
      </div>
    </section>
  );
}

async function TeaserReadings() {
  await connection();
  let snapshot: RadarSnapshot | null = null;
  try {
    snapshot = DATA_MODE === "live" ? await getRadarSnapshot() : buildSampleRadar();
  } catch (err) {
    console.error("[landing] radar teaser unavailable", err);
  }
  const top = snapshot?.narratives.filter((n) => n.lifecycle && n.metrics).slice(0, SHOW) ?? [];

  if (!snapshot || top.length === 0) {
    return (
      <div role="status" className="mt-10 border border-line bg-paper px-5 py-6 text-[14.5px] leading-relaxed text-ink-soft">
        Live market data is unavailable right now
        {snapshot?.benchmarkError ? ` (${snapshot.benchmarkError})` : ""}. Nothing is shown in its place.{" "}
        <Link href="/radar" className="underline decoration-accent underline-offset-2">
          Try the radar
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-10">
      {snapshot.mode === "sample" && (
        <SampleNotice className="mb-4">Synthetic readings for interface development, not market data.</SampleNotice>
      )}
      <div className={`mb-3 flex flex-wrap gap-x-6 gap-y-1 text-muted ${monoMeta}`}>
        <span>
          Market data <Freshness iso={snapshot.generatedAt} />
        </span>
        <span>
          {snapshot.assetsAvailable}/{snapshot.assetsConfigured} assets · ranked by where to look first
        </span>
      </div>
      <ol className="grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
        {top.map((reading, i) => (
          <li key={reading.id} className="border-b border-r border-line">
            <NarrativeCard reading={reading} rank={i + 1} />
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12px] text-muted">
        Stages describe observed market behavior. They are not predictions or trade signals.
      </p>
    </div>
  );
}

function TeaserLoading() {
  return (
    <div className="mt-10">
      <div role="status" className={`mb-3 flex items-center gap-2 text-muted ${monoMeta}`}>
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
        Loading live market data
      </div>
      <div className="grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: SHOW }, (_, i) => (
          <div key={i} className="h-60 border-b border-r border-line bg-paper" />
        ))}
      </div>
    </div>
  );
}
