import { Label } from "@/components/ui/primitives";
import { PAGE, monoMeta } from "@/components/ui/styles";
import { NARRATIVES } from "@/lib/radar/taxonomy";

export default function RadarLoading() {
  return (
    <div className={`${PAGE} pb-20 pt-10 sm:pt-14`}>
      <header className="grid gap-6 border-b border-line pb-10 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-7">
          <Label>Narrative radar</Label>
          <h1 className="mt-4 font-display text-[40px] font-bold leading-[1] tracking-[-0.035em] sm:text-[58px]">
            See where the market is moving.
          </h1>
        </div>
        <p className="text-[15.5px] leading-relaxed text-ink-soft lg:col-span-5">
          Momentum and participation across {NARRATIVES.length} market narratives, measured from Bitget market data.
        </p>
      </header>
      <div role="status" className={`mt-8 flex items-center gap-3 text-muted ${monoMeta}`}>
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
        Collecting Bitget market data for {NARRATIVES.length} narratives
      </div>
      <div className="mt-4 grid grid-cols-2 border-l border-t border-line lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 border-b border-r border-line bg-surface" />
        ))}
      </div>
      <ul className="mt-16 divide-y divide-line border border-line bg-surface">
        {NARRATIVES.map((n) => (
          <li key={n.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <span className="text-[16px] text-muted">{n.name}</span>
            <span className="h-2 w-24 bg-line" />
          </li>
        ))}
      </ul>
    </div>
  );
}
