import { Label } from "@/components/ui/primitives";
import { PAGE, monoMeta } from "@/components/ui/styles";

const POINTS = [
  {
    title: "Real market data",
    body: "Evidence comes from live Bitget market data and named public providers. Every finding shows its source, with a link to check it where one exists.",
  },
  {
    title: "Rules score, not the AI",
    body: "Verdicts, scores and narrative stages come from fixed, documented rules. The AI explains the result and can’t change it.",
  },
  {
    title: "Gaps stay gaps",
    body: "When a source fails or times out, it’s marked unavailable and left out. Nothing is estimated or filled in.",
  },
  {
    title: "No trade button",
    body: "No order execution, no exchange keys, no buy or sell signals. The research is yours, and so is the decision.",
  },
];

const SOURCES = ["Bitget Market API", "Bitget Signal", "alternative.me", "DeFiLlama", "CoinGecko"];

export function TrustSection() {
  return (
    <section className="border-t border-line">
      <div className={`${PAGE} py-16 lg:py-24`}>
        <div className="max-w-2xl">
          <Label>Why trust the verdict</Label>
          <h2 className="mt-4 font-display text-[34px] font-bold leading-[1.02] tracking-[-0.03em] sm:text-[46px]">
            Built to be checked, not believed.
          </h2>
        </div>

        <ul className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map((point) => (
            <li key={point.title} className="border-t-2 border-ink pt-5">
              <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{point.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{point.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-14 flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <span className={`mr-2 text-muted ${monoMeta}`}>Data from</span>
          {SOURCES.map((source) => (
            <span key={source} className="border border-line-strong bg-surface px-3 py-1.5 font-mono text-[12px] text-ink">
              {source}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
