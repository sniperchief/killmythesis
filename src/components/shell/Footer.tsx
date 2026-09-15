import { PAGE } from "@/components/ui/styles";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div
        className={`${PAGE} flex flex-col gap-1.5 py-5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted sm:flex-row sm:items-center sm:justify-between`}
      >
        <span>Research tool · not financial advice · no trade execution</span>
        <span>Market intelligence via Bitget Agent Hub</span>
      </div>
    </footer>
  );
}
