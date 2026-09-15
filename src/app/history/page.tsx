import { HistoryList } from "@/components/history/HistoryList";
import { Label } from "@/components/ui/primitives";
import { PAGE } from "@/components/ui/styles";

export const metadata = { title: "Research History — KillMyThesis" };

export default function HistoryPage() {
  return (
    <div className={`${PAGE} py-10 lg:py-14`}>
      <Label>Research history</Label>
      <h1 className="mt-4 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[44px]">
        Every thesis you’ve tested.
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
        Completed research is saved in this browser. Open an entry to reread the full brief.
      </p>
      <div className="mt-10">
        <HistoryList />
      </div>
    </div>
  );
}
