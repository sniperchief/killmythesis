import Link from "next/link";
import { PAGE, monoMeta } from "@/components/ui/styles";

/** Accent band, so it reads as a separate block from the dark footer directly below it. */
export function ClosingCta() {
  return (
    <section className="bg-accent text-white">
      <div className={`${PAGE} flex flex-col gap-10 py-16 lg:flex-row lg:items-end lg:justify-between lg:py-24`}>
        <div className="max-w-3xl">
          <div className={`text-white/85 ${monoMeta}`}>Before you trade</div>
          <h2 className="mt-4 font-display text-[38px] font-bold leading-[1] tracking-[-0.03em] sm:text-[56px]">
            Your next trade deserves an opponent.
          </h2>
          <p className="mt-5 max-w-xl text-[16px] font-medium leading-relaxed text-white">
            Bring the idea. KillMyThesis brings the counter-evidence, the weakest assumption and what would prove it
            wrong.
          </p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
          <Link
            href="/thesis"
            className="inline-flex w-full items-center justify-center gap-3 bg-ink px-5 py-4 font-mono text-[12px] font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-white hover:text-ink sm:w-auto sm:px-6 sm:text-[12.5px] sm:tracking-[0.14em]"
          >
            Already have a thesis?
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/radar"
            className="text-center text-[15px] font-semibold text-white underline decoration-white/60 decoration-2 underline-offset-[6px] hover:decoration-white sm:text-left"
          >
            Explore Narrative Radar
          </Link>
        </div>
      </div>
    </section>
  );
}
