import Link from "next/link";
import { PAGE, monoMeta } from "@/components/ui/styles";
import { ClosingCta } from "./ClosingCta";
import { HowItWorks } from "./HowItWorks";
import { ProblemSection } from "./ProblemSection";
import { RadarTeaser } from "./RadarTeaser";
import { TrustSection } from "./TrustSection";

/** Illustrative only: a sample claim split into the kind of assumptions the parser extracts. No results are shown. */
const EXAMPLE = {
  thesis: "Long SOL. Ecosystem activity is getting stronger and this pullback looks temporary.",
  assumptions: [
    { id: "01", text: "Ecosystem activity is strengthening.", kind: "Adoption" },
    { id: "02", text: "The pullback is temporary, not a reversal.", kind: "Price action" },
    { id: "03", text: "The strength isn’t priced in yet.", kind: "Valuation" },
  ],
};

export function LandingPage() {
  return (
    <>
      <section className={`${PAGE} grid items-center gap-12 pb-16 pt-12 sm:pt-16 lg:grid-cols-12 lg:gap-14 lg:pb-24 lg:pt-20`}>
        <div className="lg:col-span-7">
          <h1 className="font-display text-[44px] font-bold leading-[1] tracking-[-0.035em] sm:text-[64px] xl:text-[76px]">
            Bring me your trade idea. I’ll try to prove you{" "}
            <span className="relative inline-block">
              wrong
              <span aria-hidden className="absolute inset-x-[-0.06em] top-[54%] h-[0.12em] -translate-y-1/2 bg-accent" />
            </span>
            .
          </h1>
          <p className="mt-6 max-w-xl text-[16.5px] leading-relaxed text-ink-soft">
            KillMyThesis breaks your idea into the assumptions it depends on, tests each one against market data, and
            tells you where it is weakest, before the market does.
          </p>
          <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
            <Link
              href="/thesis"
              className="inline-flex w-full items-center justify-center gap-3 bg-ink px-5 py-4 font-mono text-[12px] font-semibold uppercase tracking-[0.12em] text-paper transition-colors hover:bg-accent hover:text-white sm:w-auto sm:px-6 sm:text-[12.5px] sm:tracking-[0.14em]"
            >
              Already have a thesis?
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/radar"
              className="text-center text-[15px] font-medium text-ink underline decoration-accent decoration-2 underline-offset-[6px] hover:decoration-ink sm:text-left"
            >
              No idea yet? Explore Narrative Radar
            </Link>
          </div>
        </div>

        <aside className="lg:col-span-5">
          <div className="border border-ink bg-surface">
            <div className={`flex items-center justify-between border-b border-line px-5 py-3 text-muted ${monoMeta}`}>
              <span>Example thesis</span>
              <span className="text-faint">illustration</span>
            </div>
            <p className="px-5 pt-5 text-[17px] font-medium leading-snug">“{EXAMPLE.thesis}”</p>
            <div className={`mt-5 flex items-center gap-2 px-5 text-accent ${monoMeta}`}>
              <span aria-hidden>↓</span> Rests on {EXAMPLE.assumptions.length} assumptions
            </div>
            <ol className="mt-2 border-t border-line">
              {EXAMPLE.assumptions.map((a) => (
                <li key={a.id} className="grid grid-cols-[2rem_1fr] gap-x-2 border-b border-line px-5 py-3 last:border-b-0">
                  <span className="font-mono text-[11px] text-faint">{a.id}</span>
                  <span>
                    <span className="block text-[14px] leading-snug">{a.text}</span>
                    <span className={`mt-1 block text-faint ${monoMeta}`}>{a.kind}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="border-t border-line bg-paper px-5 py-3 text-[12.5px] leading-relaxed text-muted">
              Each assumption is tested for and against. The verdict names the weakest one and what would invalidate
              it.
            </p>
          </div>
        </aside>
      </section>

      <HowItWorks />
      <ProblemSection />
      <RadarTeaser />
      <TrustSection />
      <ClosingCta />
    </>
  );
}
