"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/primitives";
import { PAGE, monoMeta } from "@/components/ui/styles";

const STEPS = [
  {
    n: "01",
    title: "Parse",
    body: "Your sentence becomes a subject, a direction and the assumptions it rests on.",
    detail: "subject · stance · assumptions",
  },
  {
    n: "02",
    title: "Research",
    body: "Each assumption is checked against market structure, technicals, positioning, sentiment, news, macro and on-chain data.",
    detail: "7 dimensions · failed sources stay unavailable",
  },
  {
    n: "03",
    title: "Evaluate",
    body: "Evidence is mapped for and against every assumption, then scored by fixed rules, not by the AI.",
    detail: "supporting ↔ challenging · deterministic score",
  },
  {
    n: "04",
    title: "Decide",
    body: "You get a verdict, the weakest assumption and what would invalidate the idea. Not a trade signal.",
    detail: "verdict · invalidation · your call",
  },
];

const PHASES = ["Parsing", "Researching", "Evaluating", "Complete"];

/** Illustration of a run's source checks. Deliberately shows no numbers or results. */
const SOURCES = [
  { label: "Market structure", unavailable: false },
  { label: "Positioning", unavailable: false },
  { label: "Sentiment", unavailable: false },
  { label: "Macro", unavailable: true },
];

const ADVANCE_MS = 4_000;

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      setActive((i) => (i + 1) % STEPS.length);
    }, ADVANCE_MS);
    return () => clearInterval(timer);
  }, [auto]);

  const select = (i: number) => {
    setAuto(false);
    setActive(i);
  };
  const progress = ((active + 1) / STEPS.length) * 100;

  return (
    <section id="how-it-works" className="scroll-mt-24 border-t border-line bg-surface">
      <div className={`${PAGE} py-16 lg:py-20`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Label>How it works</Label>
            <h2 className="mt-3 font-display text-[30px] font-bold leading-none tracking-[-0.02em] sm:text-[40px]">
              From idea to verdict in four steps.
            </h2>
          </div>
          {!auto && (
            <button type="button" onClick={() => setAuto(true)} className={`text-muted hover:text-ink ${monoMeta}`}>
              ▶ Replay
            </button>
          )}
        </div>

        <div className="relative mt-12 h-3" aria-hidden>
          <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-line" />
          <div
            className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 bg-accent transition-[width] duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink transition-[left] duration-700 ease-out"
            style={{ left: `${progress}%` }}
          />
        </div>

        <ol className="mt-12 grid gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => {
            const on = i === active;
            return (
              <li key={step.n} className="border-l border-line">
                <button
                  type="button"
                  onClick={() => select(i)}
                  aria-current={on ? "step" : undefined}
                  className="group block w-full px-5 text-left"
                >
                  <span
                    className={`block font-display text-[44px] font-bold leading-none tracking-[-0.03em] transition-colors ${
                      on ? "text-accent" : "text-line group-hover:text-line-strong"
                    }`}
                  >
                    {step.n}
                  </span>
                  <span
                    className={`mt-4 block font-mono text-[13px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                      on ? "text-ink" : "text-faint"
                    }`}
                  >
                    {step.title}
                  </span>
                  <span className={`mt-2 block text-[14px] leading-relaxed transition-colors ${on ? "text-ink-soft" : "text-faint"}`}>
                    {step.body}
                  </span>
                  <span className={`mt-3 block font-mono text-[11px] text-accent transition-opacity ${on ? "opacity-100" : "opacity-0"}`}>
                    {step.detail}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-12 grid gap-10 border-t border-line pt-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Label>Run phases</Label>
            <ol className="mt-4 flex flex-wrap items-center gap-2">
              {PHASES.map((phase, i) => (
                <li key={phase} className="flex items-center gap-2">
                  <span
                    className={`border px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] transition-colors ${
                      i === active ? "border-ink bg-ink text-paper" : i < active ? "border-ink text-ink" : "border-line-strong text-muted"
                    }`}
                  >
                    {phase}
                  </span>
                  {i < PHASES.length - 1 && <span className="font-mono text-[11px] text-faint">→</span>}
                </li>
              ))}
            </ol>
            <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-muted">
              The same phases you see live in every research session, with each source reported as it finishes.
            </p>
          </div>

          <div className="lg:col-span-7">
            <Label>Illustration · one thesis, four sources</Label>
            <ul className="mt-4 space-y-3">
              {SOURCES.map((source) => {
                const checked = active >= 1;
                const width = !checked ? 0 : source.unavailable ? 30 : 100;
                return (
                  <li key={source.label} className="grid grid-cols-[8.5rem_1fr_6.5rem] items-center gap-3 sm:grid-cols-[10rem_1fr_7rem]">
                    <span className="font-mono text-[12px] text-ink">{source.label}</span>
                    <span className="h-2 bg-line">
                      <span
                        className={`block h-full transition-[width] duration-1000 ease-out ${source.unavailable ? "bg-line-strong" : "bg-accent"}`}
                        style={{ width: `${width}%` }}
                      />
                    </span>
                    <span className={`text-right font-mono text-[11px] ${checked && source.unavailable ? "text-caution" : "text-muted"}`}>
                      {!checked ? "queued" : source.unavailable ? "⚠ unavailable" : "✓ checked"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
              When a source fails, it is shown as unavailable and left out of the score. Nothing is filled in.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
