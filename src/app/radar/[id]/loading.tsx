import { PAGE, monoMeta } from "@/components/ui/styles";

export default function NarrativeLoading() {
  return (
    <div className={`${PAGE} py-8 lg:py-10`}>
      <span className={`text-muted ${monoMeta}`}>← Narrative radar</span>
      <div className="mt-6 border-b border-line pb-6">
        <div className="h-3 w-32 bg-line" />
        <div className="mt-4 h-10 w-72 max-w-full bg-line" />
      </div>
      <div
        role="status"
        className="mt-8 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted"
      >
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
        Collecting Bitget market data
      </div>
      <div className="mt-6 grid grid-cols-2 border-l border-t border-line sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-24 border-b border-r border-line" />
        ))}
      </div>
    </div>
  );
}
