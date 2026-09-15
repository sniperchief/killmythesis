"use client";

import Link from "next/link";
import { Label } from "@/components/ui/primitives";
import { PAGE, buttonPrimary, monoMeta } from "@/components/ui/styles";
import { DIMENSION_ORDER, DIMENSIONS } from "@/lib/dimensions";
import type { NarrativeHandoff } from "@/lib/radar/handoff";
import { WorkflowSteps } from "./WorkflowSteps";

const EXAMPLES = [
  "Is the AI/compute narrative still early?",
  "I'm bullish on ETH because ETF demand should continue.",
  "I think BTC can break its previous high because liquidity is improving.",
  "Is the RWA narrative actually gaining real adoption?",
];

export function ThesisComposer({
  value,
  onChange,
  onSubmit,
  narrative = null,
  onRemoveNarrative,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  narrative?: NarrativeHandoff | null;
  onRemoveNarrative?: () => void;
}) {
  return (
    <>
      <section className={`${PAGE} grid gap-12 pb-16 pt-12 sm:pt-20 lg:grid-cols-12 lg:gap-10 lg:pb-24`}>
        <div className="lg:col-span-8">
          <Label>AI research desk · stress-test before you trade</Label>
          <h1 className="mt-5 text-[40px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[58px] lg:text-[68px]">
            Bring me your trade idea.
            <br />
            <span className="text-muted">I’ll try to prove you wrong.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-ink-soft">
            Enter a market thesis and we’ll investigate the assumptions behind it using live market intelligence.
          </p>

          <form
            className="mt-10 border border-line-strong bg-surface transition-colors focus-within:border-ink"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            {narrative && (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line bg-paper px-5 py-2.5">
                <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">
                  From Narrative Radar
                </span>
                <Link
                  href={`/radar/${narrative.id}`}
                  className="text-[13.5px] font-medium underline decoration-line-strong underline-offset-2 hover:decoration-ink"
                >
                  {narrative.name}
                </Link>
                <span className="font-mono text-[10.5px] text-faint">{narrative.assets.join(" · ")}</span>
                <button type="button" onClick={onRemoveNarrative} className={`ml-auto text-muted hover:text-ink ${monoMeta}`}>
                  Remove context
                </button>
              </div>
            )}
            <label htmlFor="thesis-input" className="sr-only">
              Your market thesis
            </label>
            <textarea
              id="thesis-input"
              rows={4}
              value={value}
              maxLength={2000}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="I’m considering going long SOL because…"
              className="block w-full resize-none bg-transparent px-5 pb-3 pt-5 text-[17px] leading-relaxed outline-none placeholder:text-faint focus-visible:outline-none"
            />
            <div className="flex items-center gap-3 border-t border-line py-2.5 pl-5 pr-2.5">
              <span className="hidden font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint sm:inline">
                Ctrl / ⌘ + Enter
              </span>
              <button type="submit" disabled={!value.trim()} className={`${buttonPrimary} ml-auto`}>
                Kill my thesis
              </button>
            </div>
          </form>
          {narrative && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              Research will use this narrative’s representative assets and its current radar reading as context. Edit
              the thesis so it states your view, then submit.
            </p>
          )}

          <div className="mt-6">
            <Label>Or try</Label>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => onChange(example)}
                  className="border border-line bg-surface px-3 py-1.5 text-left text-[13px] text-ink-soft transition-colors hover:border-ink hover:text-ink"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="lg:col-span-4 lg:pt-[52px]">
          <div className="border border-line bg-surface">
            <div className="border-b border-line px-4 py-3">
              <Label>Research coverage</Label>
            </div>
            <ul className="divide-y divide-line">
              {DIMENSION_ORDER.map((id, i) => (
                <li key={id} className="flex items-baseline gap-3 px-4 py-2.5">
                  <span className="font-mono text-[10.5px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-[13.5px]">{DIMENSIONS[id].label}</span>
                  <span className="ml-auto font-mono text-[10.5px] text-faint">{DIMENSIONS[id].skill}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-muted">
              Every thesis is checked across these dimensions. Sources that fail are marked unavailable and never
              filled in.
            </p>
          </div>
        </aside>
      </section>

      <WorkflowSteps />
    </>
  );
}
