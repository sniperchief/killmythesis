import { describe, expect, it } from "vitest";
import type { ParsedThesis } from "@/lib/types";
import { buildEvidence, mapEvidence } from "./mapper";
import { fakeLlm } from "./test-fixtures";
import type { RawFinding } from "./types";

const thesis: ParsedThesis = {
  raw: "raw",
  subject: "SOL",
  stance: "LONG",
  coreThesis: "core",
  horizon: null,
  assumptions: [
    { id: "A1", text: "Activity is strengthening.", kind: "adoption" },
    { id: "A2", text: "The pullback is temporary.", kind: "price_action" },
  ],
};

const findings: RawFinding[] = [
  {
    id: "pos-funding-history",
    dimension: "positioning",
    source: "Bitget Market API · SOLUSDT funding rate history",
    topic: "Funding history",
    observation: "Across the last 21 funding settlements, the average rate was 0.0100% and 21 of 21 were positive.",
    timestamp: "2026-09-15T00:00:00.000Z",
    rawValue: { average: 0.0001 },
    verify: { url: "https://api.bitget.com/api/v2/mix/market/history-fund-rate?productType=USDT-FUTURES&symbol=SOLUSDT&pageSize=21", label: "Bitget API data" },
  },
];

describe("evidence mapping", () => {
  it("copies facts from findings and only takes interpretation from the model", () => {
    const evidence = buildEvidence(thesis, findings, {
      judgments: [
        {
          findingId: "pos-funding-history",
          assumptionId: "A2",
          direction: "challenging",
          confidence: 1.4,
          relevance: -0.2,
          explanation: "Persistently positive funding without price expansion suggests crowded longs.",
        },
      ],
    });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      finding: findings[0].observation,
      source: findings[0].source,
      dimension: "positioning",
      timestamp: findings[0].timestamp,
      direction: "challenging",
      confidence: 1,
      relevance: 0,
      assumptionIds: ["A2"],
      rawValue: { average: 0.0001 },
      verify: findings[0].verify,
    });
  });

  it("drops judgments that reference unknown findings or assumptions", () => {
    const evidence = buildEvidence(thesis, findings, {
      judgments: [
        { findingId: "invented-fact", assumptionId: "A1", direction: "supporting", confidence: 0.9, relevance: 0.9, explanation: "x" },
        { findingId: "pos-funding-history", assumptionId: "A9", direction: "supporting", confidence: 0.9, relevance: 0.9, explanation: "x" },
      ],
    });
    expect(evidence).toEqual([]);
  });

  it("merges the same finding and direction across assumptions", () => {
    const evidence = buildEvidence(thesis, findings, {
      judgments: [
        { findingId: "pos-funding-history", assumptionId: "A2", direction: "supporting", confidence: 0.5, relevance: 0.4, explanation: "low" },
        { findingId: "pos-funding-history", assumptionId: "A1", direction: "supporting", confidence: 0.6, relevance: 0.9, explanation: "high" },
      ],
    });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ assumptionIds: ["A1", "A2"], confidence: 0.6, relevance: 0.9, explanation: "high" });
  });

  it("fails when every model judgment is ungrounded", async () => {
    const llm = fakeLlm({
      "Evidence mapper": () => ({
        judgments: [{ findingId: "nope", assumptionId: "A1", direction: "supporting", confidence: 1, relevance: 1, explanation: "x" }],
      }),
    });
    await expect(mapEvidence(llm, thesis, findings)).rejects.toThrow(/do not exist/);
  });
});
