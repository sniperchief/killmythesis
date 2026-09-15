import Link from "next/link";
import type { ReactNode } from "react";
import { Label, SampleNotice } from "@/components/ui/primitives";
import { monoMeta } from "@/components/ui/styles";
import { fmtFunding, fmtPct, fmtPts, fmtShare, fmtUsd, startingTheses } from "@/lib/radar/engine";
import type { AssetReading, NarrativeReading, RadarSnapshot } from "@/lib/radar/types";
import { Freshness } from "./Freshness";
import { signTone, StageText } from "./Stage";
import { Sparkline } from "./Sparkline";
import { ThesisHandoff } from "./ThesisHandoff";

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 border-b-2 border-ink pb-3">
        <span className="font-mono text-[12px] font-medium text-accent">{n}</span>
        <h2 className="font-display text-[22px] font-bold leading-none tracking-[-0.02em] sm:text-[26px]">{title}</h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Metric({ label, value, note, tone = "" }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <div className="border-b border-r border-line p-3.5 sm:p-4">
      <div className={`text-muted ${monoMeta}`}>{label}</div>
      <div className={`mt-1.5 font-mono text-[19px] font-semibold tabular-nums tracking-tight sm:text-[22px] ${tone}`}>{value}</div>
      <div className="mt-1 text-[12px] leading-snug text-muted">{note}</div>
    </div>
  );
}

function AssetTable({ title, assets }: { title: string; assets: AssetReading[] }) {
  if (assets.length === 0) return null;
  return (
    <div>
      <Label className="text-ink">{title}</Label>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[23rem] text-left font-mono text-[12.5px] tabular-nums">
          <thead className="text-faint">
            <tr className="border-b border-line">
              {["Asset", "7D", "vs BTC", "30D", "Volume", "Funding/8h"].map((h, i) => (
                <th key={h} scope="col" className={`py-2 pr-3 font-medium uppercase tracking-[0.08em] text-[10px] ${i ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.symbol} className="border-b border-line">
                <th scope="row" className="py-2 pr-3 font-semibold text-ink">
                  {a.symbol}
                </th>
                <td className={`py-2 pr-3 text-right ${signTone(a.return7d)}`}>{fmtPct(a.return7d)}</td>
                <td className={`py-2 pr-3 text-right ${signTone(a.relative7d)}`}>{fmtPts(a.relative7d)}</td>
                <td className="py-2 pr-3 text-right text-ink-soft">{fmtPct(a.return30d)}</td>
                <td className="py-2 pr-3 text-right text-ink-soft">{a.volumeChange === null ? "—" : fmtPct(a.volumeChange)}</td>
                <td className="py-2 pr-3 text-right text-ink-soft">{a.funding8h === null ? "—" : fmtFunding(a.funding8h)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EvidenceList({ items, glyph, tone }: { items: string[]; glyph: string; tone: string }) {
  return (
    <ul className="border-t border-line">
      {items.map((item) => (
        <li key={item} className="grid grid-cols-[1.25rem_1fr] gap-x-2 border-b border-line py-2.5 text-[14px] leading-snug">
          <span className={`font-mono text-[13px] ${tone}`}>{glyph}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function NarrativeDetail({
  snapshot,
  reading,
  why,
  wrong,
  next,
}: {
  snapshot: RadarSnapshot;
  reading: NarrativeReading;
  why: ReactNode;
  wrong: ReactNode;
  next: ReactNode;
}) {
  const m = reading.metrics;
  const b = snapshot.benchmark;
  const k = reading.assets.length;
  const topCount = Math.min(5, Math.ceil(k / 2));
  const top = reading.assets.slice(0, topCount);
  const weakest = reading.assets.slice(topCount).reverse().slice(0, 4);
  const theses = startingTheses(reading);

  return (
    <div>
      <Link href="/radar" className={`text-muted hover:text-ink ${monoMeta}`}>
        ← Narrative radar
      </Link>

      <header className="mt-6 border-b border-line pb-6">
        <Label>Narrative research</Label>
        <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
          <h1 className="font-display text-[40px] font-bold leading-none tracking-[-0.035em] sm:text-[58px]">{reading.name}</h1>
          <StageText reading={reading} className="pb-1 text-[15px] tracking-[0.16em]" />
        </div>
        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-ink-soft">{reading.description}</p>
        <dl className={`mt-4 flex flex-wrap gap-x-6 gap-y-1.5 ${monoMeta}`}>
          <div className="flex gap-2">
            <dt className="text-faint">Market data</dt>
            <dd>
              <Freshness iso={snapshot.generatedAt} />
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-faint">Assets</dt>
            <dd className={reading.coverage.level === "normal" ? "" : "text-caution"}>
              {reading.coverage.available} / {reading.coverage.configured} available
            </dd>
          </div>
          {reading.confidence && (
            <div className="flex gap-2">
              <dt className="text-faint">Data confidence</dt>
              <dd className="font-semibold">{reading.confidence.level}</dd>
            </div>
          )}
        </dl>
      </header>

      {snapshot.mode === "sample" && (
        <SampleNotice className="mt-4">
          Synthetic candles run through the real radar engine. None of these numbers are market data.
        </SampleNotice>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-12">
        <div className="min-w-0 space-y-12 lg:col-span-8">
          <Section n="01" title="What is happening?">
            <div className="border border-line bg-surface p-4">
              <Label>{reading.lifecycle ? "Why this stage" : "Not classified"}</Label>
              <p className="mt-2 text-[15px] leading-relaxed">{reading.lifecycleReason}</p>
              <p className="mt-2 text-[12px] text-muted">
                Calculated from market data by fixed rules. A stage describes observed behavior; it is not a prediction.
              </p>
            </div>

            {m && b && (
              <>
                <div className="mt-6 flex items-center gap-4">
                  <div className="w-40 shrink-0">
                    <Sparkline values={reading.trend} width={160} height={40} className="h-10 max-w-[160px]" />
                  </div>
                  <p className="text-[12.5px] leading-snug text-muted">
                    Median basket performance over 30 days, normalized to the start (dashed line).
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-2 border-l border-t border-line sm:grid-cols-3">
                  <Metric label="Median 7D return" value={fmtPct(m.median7d)} tone={signTone(m.median7d)} note={`BTC ${fmtPct(b.return7d)}`} />
                  <Metric label="Breadth" value={`${m.positiveCount} / ${k}`} note={`assets up over 7D (${fmtShare(m.breadth)})`} />
                  <Metric label="Relative performance" value={fmtPts(m.relative7d)} tone={signTone(m.relative7d)} note="median vs BTC, 7D" />
                  <Metric label="Beating BTC" value={`${m.outperformCount} / ${k}`} note={`prior week ${fmtShare(m.priorOutperformShare)}`} />
                  <Metric
                    label="Volume"
                    value={m.medianVolumeChange === null ? "—" : fmtPct(m.medianVolumeChange)}
                    note={m.medianVolumeChange === null ? "unavailable" : `median, 7D vs prior 21D · rising in ${m.volumeRisingCount}/${m.volumeCount}`}
                  />
                  <Metric label="Momentum shift" value={fmtPts(m.momentumShift)} tone={signTone(m.momentumShift)} note={`relative, prior week ${fmtPts(m.relativePrior7d)}`} />
                  <Metric label="30D relative" value={fmtPts(m.relative30d)} tone={signTone(m.relative30d)} note={`median ${fmtPct(m.median30d)} · BTC ${fmtPct(b.return30d)}`} />
                  <Metric
                    label="Funding / 8h"
                    value={m.medianFunding8h === null ? "—" : fmtFunding(m.medianFunding8h)}
                    note={m.medianFunding8h === null ? "positioning unavailable" : `median of ${m.fundingCount}/${k} perpetuals`}
                    tone={m.fundingElevated ? "text-caution" : ""}
                  />
                  <Metric
                    label="Open interest"
                    value={m.openInterestUsd === null ? "—" : fmtUsd(m.openInterestUsd)}
                    note={m.openInterestUsd === null ? "positioning unavailable" : "total, Bitget perpetuals"}
                  />
                </div>

                {reading.confidence && (
                  <div className="mt-4 text-[12.5px] leading-relaxed text-muted">
                    <span className={`mr-2 text-ink ${monoMeta}`}>Data confidence: {reading.confidence.level}</span>
                    {reading.confidence.reasons.join(" ")}
                  </div>
                )}

                {reading.confirming.length > 0 && (
                  <div className="mt-8">
                    <Label className="text-ink">What confirms the reading</Label>
                    <div className="mt-2">
                      <EvidenceList items={reading.confirming} glyph="✓" tone="text-support" />
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <AssetTable title="Top contributors" assets={top} />
              <AssetTable title="Weakest contributors" assets={weakest} />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              Representative assets used for this narrative’s analysis, not an exhaustive list of every token in the
              sector. Source: Bitget daily spot candles; funding from Bitget USDT perpetuals.
              {reading.unavailable.length > 0 &&
                ` Unavailable: ${reading.unavailable.map((u) => `${u.symbol} (${u.reason})`).join(", ")}.`}
            </p>
          </Section>

          <Section n="02" title="Why?">
            {why}
          </Section>

          <Section n="03" title="What could make this wrong?">
            {reading.notConfirming.length > 0 ? (
              <>
                <Label className="text-ink">What is not confirming the reading</Label>
                <div className="mt-2">
                  <EvidenceList items={reading.notConfirming} glyph="×" tone="text-challenge" />
                </div>
              </>
            ) : (
              <p className="text-[14px] text-muted">
                {m ? "No contradicting signal in the calculated metrics." : "There is not enough market data to test this narrative."}
              </p>
            )}
            {m && !m.fundingCount && (
              <p className="mt-3 text-[13px] text-muted">Positioning unavailable: no funding data for these assets.</p>
            )}
            {wrong}
          </Section>
        </div>

        <aside className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <Section n="04" title="Want to investigate further?">
              <div className="border border-ink bg-surface p-5">
                <ThesisHandoff
                  narrativeId={reading.id}
                  narrativeName={reading.name}
                  formThesis={theses.form}
                  killThesis={theses.kill}
                />
              </div>
              {next}
              <p className={`mt-5 text-muted ${monoMeta}`}>Research, not a trade signal · you decide</p>
            </Section>
          </div>
        </aside>
      </div>
    </div>
  );
}
