import type { ReactNode } from "react";
import { DIMENSIONS } from "@/lib/dimensions";
import { TONE_WASH, type Tone } from "@/lib/labels";
import type { SourceCheck, SourceStatus } from "@/lib/types";

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted ${className}`}>
      {children}
    </div>
  );
}

export function ToneBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-[3px] px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] ${TONE_WASH[tone]}`}
    >
      {children}
    </span>
  );
}

export function Bar({ value, strong = false }: { value: number; strong?: boolean }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className={`${strong ? "h-1.5" : "h-1"} w-full bg-line`}>
      <div className={`h-full ${strong ? "bg-accent" : "bg-ink"}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export function SampleNotice({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="note"
      className={`flex flex-col gap-1 border border-caution/25 bg-caution-wash px-3.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-3 ${className}`}
    >
      <span className="shrink-0 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-caution">
        Sample data
      </span>
      <span className="text-[13px] leading-relaxed text-ink-soft">{children}</span>
    </div>
  );
}

function StatusGlyph({ status }: { status: SourceStatus }) {
  switch (status) {
    case "ok":
      return <span className="w-4 font-mono text-[13px] text-support">✓</span>;
    case "unavailable":
      return <span className="w-4 font-mono text-[13px] text-caution">⚠</span>;
    case "running":
      return (
        <span className="flex w-4 justify-center">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
      );
    default:
      return (
        <span className="flex w-4 justify-center">
          <span className="h-1.5 w-1.5 rounded-full border border-line-strong" />
        </span>
      );
  }
}

const STATUS_TEXT: Record<SourceStatus, string> = {
  queued: "queued",
  running: "checking",
  ok: "complete",
  unavailable: "unavailable",
};

/** One row per research dimension. A row only shows ✓ when its source call succeeded. */
export function SourceStatusList({ sources }: { sources: SourceCheck[] }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {sources.map((source) => {
        const dimension = DIMENSIONS[source.dimension];
        const unavailable = source.status === "unavailable";
        return (
          <li key={source.dimension} className="flex items-center gap-3 py-2">
            <StatusGlyph status={source.status} />
            <span className={`text-[13.5px] ${unavailable || source.status === "queued" ? "text-muted" : "text-ink"}`}>
              {dimension.label}
            </span>
            <span
              className={`ml-auto text-right font-mono text-[10.5px] ${unavailable ? "text-caution" : "text-faint"}`}
              title={`${dimension.provider} · ${dimension.skill}`}
            >
              {unavailable ? (source.note ?? "unavailable") : source.status === "ok" ? dimension.skill : STATUS_TEXT[source.status]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
