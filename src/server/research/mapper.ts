/**
 * EVIDENCE MAPPING (LLM interprets, code owns the facts).
 *
 * The model judges how each deterministic finding bears on each assumption.
 * Finding text, source, dimension and timestamp are copied from the collector
 * output, never from the model, so it cannot introduce market facts.
 */
import { z } from "zod";
import type { Evidence, EvidenceDirection, ParsedThesis } from "@/lib/types";
import { LlmOutputError, type StructuredLlm } from "@/server/llm/structured";
import type { RawFinding } from "./types";

export const MapperOutput = z.object({
  judgments: z.array(
    z.object({
      findingId: z.string(),
      assumptionId: z.string(),
      direction: z.enum(["supporting", "challenging", "neutral"]),
      confidence: z.number(),
      relevance: z.number(),
      explanation: z.string(),
    }),
  ),
});
export type MapperOutput = z.infer<typeof MapperOutput>;

const SYSTEM = `You are the evidence analyst for KillMyThesis, a research desk that tries to disprove a trader's thesis.

You receive the thesis assumptions and a list of findings. Each finding is a verified observation from market data. For every finding that genuinely bears on an assumption, output one judgment:
- direction: "supporting", "challenging", or "neutral" (relevant but no meaningful effect either way).
- confidence (0-1): how reliable this finding is as evidence. Direct measurements score higher; proxies (e.g. market-wide sentiment for a single coin, a single headline) score lower.
- relevance (0-1): how directly the finding tests that specific assumption.
- explanation: one or two sentences on WHY the finding matters for the assumption.

Rules:
- Interpret only. Never state numbers, events or facts that are not in the finding's observation.
- Omit pairs where the finding has nothing to do with the assumption. Do not force every finding onto every assumption.
- Be adversarial but fair: actively look for how findings challenge the thesis.
- Use the exact findingId and assumptionId values given.`;

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Deterministically merges model judgments with the findings they reference. */
export function buildEvidence(thesis: ParsedThesis, findings: RawFinding[], output: MapperOutput): Evidence[] {
  const findingById = new Map(findings.map((f) => [f.id, f]));
  const assumptionIds = new Set(thesis.assumptions.map((a) => a.id));
  const grouped = new Map<string, Evidence>();

  for (const j of output.judgments) {
    const finding = findingById.get(j.findingId);
    const explanation = j.explanation.trim();
    if (!finding || !assumptionIds.has(j.assumptionId) || !explanation) continue;

    const key = `${finding.id}:${j.direction}`;
    const confidence = clamp01(j.confidence);
    const relevance = clamp01(j.relevance);
    const existing = grouped.get(key);

    if (existing) {
      if (!existing.assumptionIds.includes(j.assumptionId)) existing.assumptionIds.push(j.assumptionId);
      if (relevance > existing.relevance) existing.explanation = explanation;
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.relevance = Math.max(existing.relevance, relevance);
      continue;
    }

    grouped.set(key, {
      id: `${finding.id}-${j.direction.slice(0, 3)}`,
      findingId: finding.id,
      source: finding.source,
      dimension: finding.dimension,
      topic: finding.topic,
      finding: finding.observation,
      direction: j.direction as EvidenceDirection,
      confidence,
      relevance,
      timestamp: finding.timestamp,
      explanation,
      assumptionIds: [j.assumptionId],
      rawValue: finding.rawValue,
      ...(finding.verify ? { verify: finding.verify } : {}),
    });
  }

  const order = thesis.assumptions.map((a) => a.id);
  return [...grouped.values()].map((e) => ({
    ...e,
    assumptionIds: [...e.assumptionIds].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
  }));
}

export async function mapEvidence(
  llm: StructuredLlm,
  thesis: ParsedThesis,
  findings: RawFinding[],
  signal?: AbortSignal,
): Promise<Evidence[]> {
  const prompt = JSON.stringify(
    {
      thesis: { subject: thesis.subject, stance: thesis.stance, coreThesis: thesis.coreThesis },
      assumptions: thesis.assumptions.map((a) => ({ assumptionId: a.id, text: a.text })),
      findings: findings.map((f) => ({
        findingId: f.id,
        dimension: f.dimension,
        topic: f.topic,
        observation: f.observation,
        timestamp: f.timestamp,
      })),
    },
    null,
    1,
  );

  const output = await llm({ name: "Evidence mapper", system: SYSTEM, prompt, schema: MapperOutput }, signal);
  const evidence = buildEvidence(thesis, findings, output);
  if (output.judgments.length > 0 && evidence.length === 0) {
    throw new LlmOutputError("Evidence mapper referenced findings or assumptions that do not exist.");
  }
  return evidence;
}
