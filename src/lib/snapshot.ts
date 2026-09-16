/**
 * RESEARCH SNAPSHOT — the data a verdict was built on.
 *
 * Stores every finding the research used, with its validated values (rawValue) and source
 * timestamps, which sources answered, and each call that returned no usable data. Shown in
 * the brief as the "Data used" panel, so the numbers behind a verdict can always be checked.
 */
import type { ResearchSnapshot, SnapshotFailure, SnapshotFinding, SourceCheck } from "./types";

const MAX_FAILURES = 40;

export function buildResearchSnapshot(input: {
  capturedAt: string;
  subject: string;
  symbols: string[];
  sources: SourceCheck[];
  findings: SnapshotFinding[];
  failures: SnapshotFailure[];
}): ResearchSnapshot {
  const seen = new Set<string>();
  const failures = input.failures.filter((f) => {
    const key = `${f.dimension}|${f.source}|${f.reason}`;
    return !seen.has(key) && seen.add(key);
  });
  return {
    version: 1,
    capturedAt: input.capturedAt,
    subject: input.subject,
    symbols: [...input.symbols],
    sources: input.sources.map((s) => ({ ...s })),
    // A plain-data copy, exactly as it is saved to and reloaded from research history.
    findings: JSON.parse(JSON.stringify(input.findings)) as SnapshotFinding[],
    failures: failures.slice(0, MAX_FAILURES),
  };
}
