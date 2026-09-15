"use client";

import Link from "next/link";
import { Label } from "@/components/ui/primitives";
import { PAGE, monoMeta } from "@/components/ui/styles";
import { DATA_MODE } from "@/lib/config";
import { DIMENSION_ORDER, DIMENSIONS } from "@/lib/dimensions";
import type { NarrativeHandoff } from "@/lib/radar/handoff";

/** The server rejects shorter theses (see server/research/http.ts). */
const MIN_LENGTH = 8;
const MAX_LENGTH = 2000;

const EXAMPLES = [
  { tag: "Narrative · question", text: "Is the AI/compute narrative still early?" },
  { tag: "Asset · long", text: "I'm bullish on ETH because ETF demand should continue." },
  { tag: "Asset · long", text: "I think BTC can break its previous high because liquidity is improving." },
  { tag: "Narrative · question", text: "Is the RWA narrative actually gaining real adoption?" },
];

/** Mirrors what the thesis parser actually requires. */
const TESTABLE = [
  { title: "A subject", body: "An asset like SOL, or a narrative like AI / Compute." },
  { title: "A direction or a question", body: "Bullish, bearish, or what you want to know." },
  { title: "Your reasons", body: "Each reason becomes an assumption we test." },
];

const DELIVERABLES = [
  { title: "Verdict & score", body: "A research verdict from fixed rules, not a trade signal." },
  { title: "Assumption check", body: "Every assumption marked supported, weak or contradicted." },
  { title: "Evidence for and against", body: "Sourced findings on both sides, with verify links." },
  { title: "What would invalidate it", body: "Concrete conditions to watch after you decide." },
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
  const length = value.trim().length;
  const ready = length >= MIN_LENGTH;
  const submit = () => {
    if (ready) onSubmit();
  };

  return (
    <div className={`${PAGE} pb-20 pt-10 sm:pt-14`}>
      <header className="grid gap-6 border-b border-line pb-10 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-8">
          <Label>Kill my thesis</Label>
          <h1 className="mt-4 font-display text-[40px] font-bold leading-[1] tracking-[-0.035em] sm:text-[58px]">
            Put your idea on trial.
          </h1>
        </div>
        <p className="text-[15.5px] leading-relaxed text-ink-soft lg:col-span-4">
          State the trade idea and why you believe it. We break it into assumptions and test each one against{" "}
          {DATA_MODE === "live" ? "live market data" : "sample data"}.
        </p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <form
            className="border border-ink bg-surface"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className={`flex items-center justify-between border-b border-line px-5 py-3 text-muted ${monoMeta}`}>
              <span className="text-ink">Your thesis</span>
              <span className={length > MAX_LENGTH - 100 ? "text-caution" : ""}>
                {value.length} / {MAX_LENGTH}
              </span>
            </div>

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
              rows={6}
              value={value}
              maxLength={MAX_LENGTH}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="I’m considering going long SOL because ecosystem activity is getting stronger and this pullback looks temporary…"
              className="block w-full resize-none bg-transparent px-5 pb-4 pt-5 text-[18px] leading-relaxed outline-none placeholder:text-faint focus-visible:outline-none"
            />

            <div className="flex flex-wrap items-center gap-3 border-t border-line bg-paper py-3 pl-5 pr-3">
              <span className={`text-faint ${monoMeta}`}>
                {length > 0 && !ready ? `At least ${MIN_LENGTH} characters` : "Ctrl / ⌘ + Enter to submit"}
              </span>
              <button
                type="submit"
                disabled={!ready}
                className="ml-auto inline-flex items-center gap-3 bg-ink px-6 py-3.5 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-muted"
              >
                Kill my thesis
                <span aria-hidden>→</span>
              </button>
            </div>
          </form>
          {narrative && (
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              Research will use this narrative’s representative assets and its current radar reading as context. Edit
              the thesis so it states your view, then submit.
            </p>
          )}

          <section className="mt-10">
            <Label>Start from an example</Label>
            <div className="mt-4 grid border-l border-t border-line sm:grid-cols-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example.text}
                  type="button"
                  onClick={() => onChange(example.text)}
                  className="group flex flex-col items-start border-b border-r border-line bg-surface p-5 text-left transition-colors hover:bg-paper"
                >
                  <span className={`text-accent ${monoMeta}`}>{example.tag}</span>
                  <span className="mt-2 text-[15px] leading-snug text-ink">“{example.text}”</span>
                  <span className={`mt-4 text-muted transition-colors group-hover:text-ink ${monoMeta}`}>Use this →</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6 lg:col-span-4">
          <div className="bg-ink p-6 text-paper">
            <div className={`text-accent ${monoMeta}`}>What makes a thesis testable</div>
            <ul className="mt-5 space-y-4">
              {TESTABLE.map((item) => (
                <li key={item.title} className="grid grid-cols-[1.25rem_1fr] gap-x-2">
                  <span aria-hidden className="font-mono text-[13px] text-accent">
                    ✓
                  </span>
                  <span>
                    <span className="block text-[14.5px] font-medium">{item.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-paper/65">{item.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-paper/15 pt-4 text-[12.5px] leading-relaxed text-paper/60">
              A time horizon, price target or stop is optional. If the direction is unclear, we ask before researching
              anything.
            </p>
          </div>

          <div className="border border-line bg-surface">
            <div className="border-b border-line px-5 py-3">
              <Label>Research coverage</Label>
            </div>
            <ul className="divide-y divide-line">
              {DIMENSION_ORDER.map((id, i) => (
                <li key={id} className="flex items-baseline gap-3 px-5 py-2.5">
                  <span className="font-mono text-[10.5px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-[13.5px]">{DIMENSIONS[id].label}</span>
                  <span className="ml-auto font-mono text-[10.5px] text-faint">{DIMENSIONS[id].skill}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-5 py-3 text-[12px] leading-relaxed text-muted">
              Sources that fail are marked unavailable and never filled in.
            </p>
          </div>

          <Link
            href="/radar"
            className="group flex items-center justify-between border border-line bg-surface px-5 py-4 transition-colors hover:border-ink"
          >
            <span>
              <span className={`block text-muted ${monoMeta}`}>No idea yet?</span>
              <span className="mt-1 block text-[15px] font-medium">Find one on Narrative Radar</span>
            </span>
            <span aria-hidden className="font-mono text-muted transition-colors group-hover:text-accent">
              →
            </span>
          </Link>
        </aside>
      </div>

      <section className="mt-16 border-t border-line pt-10">
        <Label>What you get back</Label>
        <ul className="mt-6 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {DELIVERABLES.map((item, i) => (
            <li key={item.title} className="border-t-2 border-ink pt-4">
              <span className="font-mono text-[11px] font-medium text-accent">{String(i + 1).padStart(2, "0")}</span>
              <h2 className="mt-2 text-[16px] font-semibold tracking-[-0.01em]">{item.title}</h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
