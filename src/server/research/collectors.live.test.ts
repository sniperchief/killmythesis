/**
 * Live connector smoke test: real Bitget REST, the public Bitget Signal MCP server,
 * and the public providers called directly (alternative.me, DeFiLlama, CoinGecko).
 * No LLM involved. Skipped unless LIVE_CONNECTORS=1.
 *
 *   PowerShell: $env:LIVE_CONNECTORS="1"; npx vitest run src/server/research/collectors.live.test.ts --silent=false --reporter=verbose
 */
import { describe, expect, it } from "vitest";
import { DIMENSION_ORDER } from "@/lib/dimensions";
import { createBitgetRest } from "@/server/connectors/bitget-rest";
import { SignalMcpClient } from "@/server/connectors/mcp-client";
import { createPublicData } from "@/server/connectors/public-data";
import { COLLECTORS } from "./collectors";
import { TIMEOUTS, withTimeout } from "./timeouts";
import type { CollectorContext, Memo, RawFinding } from "./types";

const live = process.env.LIVE_CONNECTORS === "1";

function memo(): Memo {
  const cache = new Map<string, Promise<unknown>>();
  return <T>(key: string, load: () => Promise<T>) => {
    if (!cache.has(key)) cache.set(key, load());
    return cache.get(key) as Promise<T>;
  };
}

describe.skipIf(!live)("live connectors", () => {
  it("collects real findings for SOL with production timeouts", { timeout: 180_000 }, async () => {
    const base = {
      target: { subject: "SOL", subjectType: "asset" as const, symbols: ["SOL"], newsKeywords: ["Solana", "SOL"] },
      rest: createBitgetRest(),
      mcp: new SignalMcpClient(),
      publicData: createPublicData(),
      memo: memo(),
    };

    const report = await Promise.all(
      DIMENSION_ORDER.map(async (dimension) => {
        const ctx: CollectorContext = { ...base, failures: [] };
        const started = Date.now();
        let findings: RawFinding[] = [];
        let budgetError: string | null = null;
        try {
          findings = await withTimeout(dimension, TIMEOUTS.dimensionMs, (s) => COLLECTORS[dimension](ctx, s));
        } catch (err) {
          budgetError = err instanceof Error ? err.message : String(err);
        }
        return { dimension, ms: Date.now() - started, findings, failures: ctx.failures, budgetError };
      }),
    );

    for (const r of report) {
      console.log(`\n[${r.dimension}] ${r.findings.length ? "OK" : "UNAVAILABLE"} (${r.ms}ms)`);
      for (const f of r.findings) console.log(`  + ${f.source} | ${f.observation} | ${f.timestamp ?? "no timestamp"}`);
      for (const f of r.failures) console.log(`  - ${f.source} | ${f.reason} | ${f.error}`);
      if (r.budgetError) console.log(`  - dimension budget | ${r.budgetError}`);
    }

    const byDimension = Object.fromEntries(report.map((r) => [r.dimension, r]));
    expect(byDimension.market_structure.findings.length).toBeGreaterThan(0);
    expect(byDimension.technical.findings.length).toBeGreaterThan(0);
    expect(byDimension.sentiment.findings.length).toBeGreaterThan(0);
    expect(byDimension.onchain.findings.length).toBeGreaterThan(0);
  });

  it("reports intentionally broken sources as failures", { timeout: 60_000 }, async () => {
    const rest = createBitgetRest();
    const unlisted = await rest.spotTicker("NOTACOINUSDT");
    console.log("unlisted symbol:", unlisted);
    expect(unlisted).toMatchObject({ ok: false, reason: "not_listed" });

    const unknownChain = await createPublicData().chainTvlHistory("NotAChainXYZ");
    console.log("unknown DeFiLlama chain:", unknownChain);
    expect(unknownChain.ok).toBe(false);

    const impatient = new SignalMcpClient({ callTimeoutMs: 1, initTimeoutMs: 1 });
    const timedOut = await impatient.callTool("news_feed", { action: "latest", feeds: "coindesk", limit: 1 });
    console.log("1ms MCP timeout:", timedOut);
    expect(timedOut).toMatchObject({ ok: false, reason: "timeout" });

    const wrongEndpoint = new SignalMcpClient({ url: "https://datahub.noxiaohao.com/not-an-mcp-endpoint" });
    const broken = await wrongEndpoint.callTool("news_feed", { action: "latest", feeds: "coindesk", limit: 1 });
    console.log("wrong MCP endpoint:", broken);
    expect(broken.ok).toBe(false);
  });
});
