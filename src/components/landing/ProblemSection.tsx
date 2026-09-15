import { Label } from "@/components/ui/primitives";
import { PAGE, monoMeta } from "@/components/ui/styles";

const USUAL = [
  "Charts that confirm what you already believe.",
  "Threads and group chats that echo the same view.",
  "AI chatbots that agree with however you phrase the question.",
  "No clear answer to “what would prove me wrong?”",
];

const OURS = [
  "Breaks your idea into the assumptions it depends on.",
  "Looks for evidence against each assumption, not just for it.",
  "Names the weakest assumption in your thesis.",
  "Spells out what would invalidate it, before you trade.",
];

export function ProblemSection() {
  return (
    <section className="border-t border-line">
      <div className={`${PAGE} grid gap-12 py-16 lg:grid-cols-12 lg:gap-14 lg:py-24`}>
        <div className="lg:col-span-5">
          <Label>The problem</Label>
          <h2 className="mt-4 font-display text-[34px] font-bold leading-[1.02] tracking-[-0.03em] sm:text-[46px]">
            Every tool is built to agree with you. <span className="text-muted">This one isn’t.</span>
          </h2>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-soft">
            Confirmation bias is one of the costliest habits in trading, and most research makes it worse. KillMyThesis
            starts from the other side: it assumes your idea might be wrong and goes looking for why.
          </p>
        </div>

        <div className="grid border border-ink sm:grid-cols-2 lg:col-span-7">
          <div className="bg-surface p-6 sm:p-7">
            <div className={`text-muted ${monoMeta}`}>The usual research</div>
            <ul className="mt-5 space-y-4">
              {USUAL.map((item) => (
                <li key={item} className="grid grid-cols-[1.25rem_1fr] gap-x-2 text-[14.5px] leading-snug text-muted">
                  <span aria-hidden className="font-mono text-faint">
                    ×
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-ink p-6 text-paper sm:p-7">
            <div className={`text-accent ${monoMeta}`}>KillMyThesis</div>
            <ul className="mt-5 space-y-4">
              {OURS.map((item) => (
                <li key={item} className="grid grid-cols-[1.25rem_1fr] gap-x-2 text-[14.5px] leading-snug">
                  <span aria-hidden className="font-mono text-accent">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
