import type { ReactNode } from "react";
import { Label } from "@/components/ui/primitives";
import { monoMeta } from "@/components/ui/styles";
import { DIMENSION_ORDER, DIMENSIONS } from "@/lib/dimensions";
import { formatDateTime } from "@/lib/format";
import type { ResearchBrief } from "@/lib/types";

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className={`text-faint ${monoMeta}`}>{label}</dt>
      <dd className="mt-1 text-[13px] leading-snug text-ink">{children}</dd>
    </div>
  );
}

/** The values, sources and timestamps this verdict was built on. */
export function DataUsedView({ brief }: { brief: ResearchBrief }) {
  const snapshot = brief.snapshot;
  if (!snapshot) return null;

  const findings = [...snapshot.findings].sort(
    (a, b) => DIMENSION_ORDER.indexOf(a.dimension) - DIMENSION_ORDER.indexOf(b.dimension),
  );
  const answered = snapshot.sources.filter((s) => s.status === "ok").length;
  const unavailable = snapshot.sources.filter((s) => s.status === "unavailable");

  return (
    <section className="border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <Label className="text-ink">Data used</Label>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-4">
        <Meta label="Retrieved">{formatDateTime(snapshot.capturedAt)}</Meta>
        <Meta label="Asset">
          {snapshot.subject}
          {snapshot.symbols.length > 0 && <span className="text-muted"> · {snapshot.symbols.join(", ")}</span>}
        </Meta>
        <Meta label="Sources">
          {answered}/{snapshot.sources.length} returned data · {snapshot.findings.length} findings
        </Meta>
        <Meta label="Unavailable">
          {unavailable.length ? unavailable.map((s) => DIMENSIONS[s.dimension].label).join(", ") : "None"}
        </Meta>
      </dl>

      <details open className="group border-t border-line">
        <summary className={`cursor-pointer list-none px-4 py-2.5 text-muted hover:text-ink ${monoMeta}`}>
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
          Values · {findings.length}
        </summary>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[40rem] text-left text-[12.5px]">
            <thead className={`text-faint ${monoMeta}`}>
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-2 font-medium">Dimension</th>
                <th scope="col" className="py-2 pr-4 font-medium">Metric · value used</th>
                <th scope="col" className="py-2 pr-4 font-medium">Source</th>
                <th scope="col" className="py-2 pr-4 font-medium">Data time</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.id} className="border-b border-line align-top last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-2 text-muted">{DIMENSIONS[f.dimension].label}</td>
                  <td className="py-2 pr-4">
                    <span className="font-medium text-ink">{f.topic}</span>
                    <span className="block text-ink-soft">{f.observation}</span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-[11px] text-muted">{f.source}</td>
                  <td className="whitespace-nowrap py-2 pr-4 font-mono text-[11px] text-muted">
                    {f.timestamp ? formatDateTime(f.timestamp) : "not provided"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {snapshot.failures.length > 0 && (
          <div className="border-t border-line px-4 py-3">
            <div className={`text-caution ${monoMeta}`}>Calls that returned no usable data</div>
            <ul className="mt-2 space-y-1 font-mono text-[11px] text-muted">
              {snapshot.failures.map((f) => (
                <li key={`${f.dimension}|${f.source}|${f.reason}`}>
                  {DIMENSIONS[f.dimension].label} · {f.source} · {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </details>
    </section>
  );
}
