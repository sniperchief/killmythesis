import { Label } from "@/components/ui/primitives";
import { PAGE } from "@/components/ui/styles";

const STEPS = [
  ["01", "State your thesis", "Write the trade idea the way you’d explain it to a colleague."],
  ["02", "We break it into assumptions", "Every thesis rests on claims that can be checked. We make them explicit."],
  ["03", "We investigate the evidence", "Market structure, technicals, positioning, sentiment, news, macro and on-chain data."],
  ["04", "We challenge the thesis", "Evidence is mapped to each assumption, for and against, then scored."],
  ["05", "You make the decision", "You get a research verdict, not a trade signal."],
] as const;

export function WorkflowSteps() {
  return (
    <section className="border-t border-line bg-surface">
      <div className={`${PAGE} py-14`}>
        <Label>How it works</Label>
        <ol className="mt-6 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map(([n, title, body]) => (
            <li key={n} className="border-b border-r border-line p-5">
              <div className="font-mono text-[11px] font-medium text-accent">{n}</div>
              <div className="mt-3 text-[15px] font-medium leading-snug">{title}</div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
