import { describe, expect, it } from "vitest";
import { SAMPLE_EVIDENCE, SAMPLE_SOURCES, SAMPLE_THESIS } from "@/lib/dev/sample-fixtures";
import { classifyAssumption, evaluateThesis, sourceCoverage } from "./scoring";
import type { Evidence, SourceCheck } from "./types";

const ev = (id: string, direction: Evidence["direction"], confidence: number, relevance: number, assumptionIds = ["A1"]): Evidence => ({
  id,
  source: "test",
  dimension: "technical",
  topic: "t",
  finding: "f",
  direction,
  confidence,
  relevance,
  timestamp: null,
  explanation: "e",
  assumptionIds,
});

const allOk: SourceCheck[] = [
  { dimension: "technical", status: "ok" },
  { dimension: "market_structure", status: "ok" },
];

describe("deterministic scoring", () => {
  it("produces identical results for identical evidence", () => {
    const a = evaluateThesis(SAMPLE_THESIS, SAMPLE_EVIDENCE, SAMPLE_SOURCES);
    const b = evaluateThesis(SAMPLE_THESIS, structuredClone(SAMPLE_EVIDENCE), SAMPLE_SOURCES);
    expect(a).toEqual(b);
  });

  it("scores the documented reference case exactly", () => {
    const result = evaluateThesis(SAMPLE_THESIS, SAMPLE_EVIDENCE, SAMPLE_SOURCES);
    expect(result.score).toMatchObject({
      evidenceSupport: 51,
      marketConfirmation: 41,
      contradictingEvidence: 52,
      keyAssumptionRisk: 48,
      total: 48,
    });
    expect(result.verdict).toBe("PARTIALLY_SUPPORTED");
    expect(result.assumptions.map((a) => a.result)).toEqual(["partially_supported", "partially_supported", "weak"]);
  });

  it("classifies assumptions by weighted support ratio", () => {
    const assumption = SAMPLE_THESIS.assumptions[0];
    expect(classifyAssumption(assumption, [ev("1", "supporting", 0.9, 0.9)]).result).toBe("supported");
    expect(classifyAssumption(assumption, [ev("1", "challenging", 0.9, 0.9)]).result).toBe("contradicted");
    expect(classifyAssumption(assumption, [ev("1", "neutral", 0.9, 0.9)]).result).toBe("insufficient_data");
    expect(classifyAssumption(assumption, [ev("1", "supporting", 0.3, 0.3)]).result).toBe("uncertain");
  });

  it("refuses a verdict when coverage or evidence is too thin", () => {
    const evidence = [ev("1", "supporting", 1, 1), ev("2", "supporting", 1, 1), ev("3", "supporting", 1, 1)];
    const failed: SourceCheck[] = [
      { dimension: "technical", status: "ok" },
      { dimension: "news", status: "unavailable" },
      { dimension: "macro", status: "unavailable" },
    ];
    expect(evaluateThesis(SAMPLE_THESIS, evidence, failed).verdict).toBe("INSUFFICIENT_DATA");
    expect(evaluateThesis(SAMPLE_THESIS, evidence.slice(0, 2), allOk).verdict).toBe("INSUFFICIENT_DATA");
  });

  it("pulls the score toward 50 when sources are missing", () => {
    const evidence = [ev("1", "supporting", 1, 1), ev("2", "supporting", 1, 1), ev("3", "supporting", 1, 1)];
    const full = evaluateThesis(SAMPLE_THESIS, evidence, allOk).score.total;
    const partial = evaluateThesis(SAMPLE_THESIS, evidence, [...allOk, { dimension: "news", status: "unavailable" }]).score.total;
    expect(full).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(50);
  });

  it("ignores queued and running sources in coverage", () => {
    expect(sourceCoverage([{ dimension: "news", status: "running" }, { dimension: "macro", status: "ok" }])).toBe(1);
    expect(sourceCoverage([])).toBe(0);
  });
});
