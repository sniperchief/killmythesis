import { DIMENSIONS } from "./dimensions";
import type { SourceCheck } from "./types";

/** Deterministic sentence describing which research dimensions actually returned data. */
export function coverageSummary(sources: SourceCheck[]): string | null {
  const finished = sources.filter((s) => s.status === "ok" || s.status === "unavailable");
  if (finished.length === 0) return null;
  const ok = finished.filter((s) => s.status === "ok").length;
  const missing = finished.filter((s) => s.status === "unavailable").map((s) => DIMENSIONS[s.dimension].label);
  const base = `Research was completed using ${ok} of ${finished.length} planned dimensions.`;
  if (missing.length === 0) return base;
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `${base} ${list} ${missing.length === 1 ? "was" : "were"} unavailable during this run.`;
}
