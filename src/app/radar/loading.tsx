import { Label } from "@/components/ui/primitives";
import { PAGE } from "@/components/ui/styles";
import { NARRATIVES } from "@/lib/radar/taxonomy";

export default function RadarLoading() {
  return (
    <div className={`${PAGE} py-10 lg:py-14`}>
      <Label>Discover</Label>
      <h1 className="mt-4 text-[34px] font-semibold uppercase leading-none tracking-[-0.02em] sm:text-[48px]">Narrative radar</h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-soft">
        Find where market attention and participation are moving.
      </p>
      <div
        role="status"
        className="mt-8 flex items-center gap-3 border-y border-line py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted"
      >
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
        Collecting Bitget market data for {NARRATIVES.length} narratives
      </div>
      <ul className="mt-6 divide-y divide-line border border-line bg-surface">
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
