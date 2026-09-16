import { describe, expect, it } from "vitest";
import { buildResearchSnapshot } from "./snapshot";
import type { SnapshotFinding, SourceCheck } from "./types";

const findings: SnapshotFinding[] = [
  {
    id: "ta-trend",
    dimension: "technical",
    source: "Bitget Market API · SOLUSDT spot candles",
    topic: "Trend",
    observation: "SOL last close 150.00 is +7.9% vs its 50-day SMA (139.00).",
    timestamp: "2026-09-15T00:00:00.000Z",
    rawValue: { close: 150, sma20: 143, sma50: 139 },
  },
  { id: "chain-tvl", dimension: "onchain", source: "DeFiLlama · chain TVL", topic: "TVL", observation: "TVL $5.9B.", timestamp: null, rawValue: { tvl: 5.9e9 } },
];

const sources: SourceCheck[] = [
  { dimension: "technical", status: "ok" },
  { dimension: "onchain", status: "ok" },
  { dimension: "positioning", status: "unavailable", note: "unavailable · timeout" },
];

const build = () =>
  buildResearchSnapshot({
    capturedAt: "2026-09-15T10:00:00.000Z",
    subject: "SOL",
    symbols: ["SOL"],
    sources,
    findings,
    failures: [
      { dimension: "positioning", source: "Bitget futures ticker SOLUSDT", reason: "timeout" },
      { dimension: "positioning", source: "Bitget futures ticker SOLUSDT", reason: "timeout" },
      { dimension: "positioning", source: "Bitget funding history SOLUSDT", reason: "timeout" },
    ],
  });

describe("data used snapshot", () => {
  it("stores the actual values, source timestamps and source status the research used", () => {
    const snapshot = build();
    expect(snapshot).toMatchObject({ version: 1, capturedAt: "2026-09-15T10:00:00.000Z", subject: "SOL", symbols: ["SOL"], sources });
    expect(snapshot.findings).toEqual(findings);
    expect(snapshot.findings[0].rawValue).toEqual({ close: 150, sma20: 143, sma50: 139 });
  });

  it("records each failed call once", () => {
    expect(build().failures).toEqual([
      { dimension: "positioning", source: "Bitget futures ticker SOLUSDT", reason: "timeout" },
      { dimension: "positioning", source: "Bitget funding history SOLUSDT", reason: "timeout" },
    ]);
  });

  it("is a copy that later changes to the inputs cannot alter", () => {
    const snapshot = build();
    (findings[0].rawValue as { close: number }).close = 1;
    sources[0].status = "unavailable";
    expect(snapshot.findings[0].rawValue).toEqual({ close: 150, sma20: 143, sma50: 139 });
    expect(snapshot.sources[0].status).toBe("ok");
    (findings[0].rawValue as { close: number }).close = 150;
    sources[0].status = "ok";
  });

  it("survives the JSON round trip that research history uses", () => {
    const snapshot = build();
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});
