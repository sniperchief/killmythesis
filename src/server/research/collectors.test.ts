import { describe, expect, it } from "vitest";
import { success } from "@/server/connectors/types";
import { COLLECTORS, matchChain } from "./collectors";
import { failingMcp, fakePublicData, fakeRest } from "./test-fixtures";
import type { CollectorContext, McpToolCaller, Memo, ResearchTarget } from "./types";

const memo: Memo = <T>(_key: string, load: () => Promise<T>) => load();

const context = (target: ResearchTarget, working = true, mcp: McpToolCaller = failingMcp()): CollectorContext => ({
  target,
  rest: fakeRest(),
  mcp,
  publicData: fakePublicData(working),
  memo,
  failures: [],
});

const SOL: ResearchTarget = { subject: "SOL", subjectType: "asset", symbols: ["SOL"], newsKeywords: ["Solana", "SOL"] };
const AI: ResearchTarget = { subject: "AI / Compute", subjectType: "narrative", symbols: ["FET", "RENDER"], newsKeywords: ["AI"] };
const run = (dimension: keyof typeof COLLECTORS, ctx: CollectorContext) => COLLECTORS[dimension](ctx, new AbortController().signal);

describe("sentiment collector (alternative.me)", () => {
  it("builds level and trend findings labeled with the real provider", async () => {
    const findings = await run("sentiment", context(SOL));
    expect(findings.map((f) => f.observation)).toEqual([
      "The market-wide crypto Fear & Greed index reads 69 (Greed).",
      "Over the last 3 daily readings the Fear & Greed index moved from 63 (Greed) to 69 (Greed), ranging 55–69.",
    ]);
    expect(findings.every((f) => f.source === "alternative.me · Crypto Fear & Greed Index")).toBe(true);
    expect(findings[0].timestamp).toBe("2026-09-15T00:00:00.000Z");
  });

  it("returns no findings and records the failure when the provider is down", async () => {
    const ctx = context(SOL, false);
    expect(await run("sentiment", ctx)).toEqual([]);
    expect(ctx.failures).toMatchObject([{ reason: "http" }]);
  });
});

describe("on-chain collector (DeFiLlama + CoinGecko)", () => {
  it("researches the matching chain plus market-wide capital", async () => {
    const findings = await run("onchain", context(SOL));
    expect(Object.fromEntries(findings.map((f) => [f.id, f.observation]))).toEqual({
      "chain-tvl": "Solana DeFi TVL is $5.87B, ranked #2 of 2 chains tracked.",
      "chain-tvl-trend": "Solana DeFi TVL changed +6.6% over 7 days and +17.3% over 30 days ($5.00B → $5.87B).",
      "chain-dex-volume": "Solana DEX volume was $8.00B over the last 7 days (+12.5% vs the prior 7 days), and $30.00B over 30 days (-4.2% vs the prior 30 days).",
      "chain-stablecoins": "Total USD-pegged stablecoin supply is $311.96B, +0.4% over 7 days and +1.7% over 30 days.",
      "chain-global": "Total crypto market cap is $2.64T (-2.7% over 24h); BTC dominance is 58.3% and ETH dominance 11.4%.",
    });
    expect(findings.find((f) => f.id === "chain-tvl-trend")?.source).toBe("DeFiLlama · Solana TVL history");
  });

  it("still reports market-wide capital for a narrative with no single chain", async () => {
    const ctx = context(AI);
    const findings = await run("onchain", ctx);
    expect(findings.map((f) => f.id)).toEqual(["chain-stablecoins", "chain-global"]);
    expect(ctx.failures).toEqual([]);
  });

  it("is unavailable when every provider fails", async () => {
    const ctx = context(SOL, false);
    expect(await run("onchain", ctx)).toEqual([]);
    expect(ctx.failures).toHaveLength(3);
  });

  it("matches chains by name first, then by gas token for single assets", () => {
    const chains = [
      { name: "Ethereum", tvl: 50, tokenSymbol: "ETH", geckoId: "ethereum" },
      { name: "Solana", tvl: 5, tokenSymbol: "SOL", geckoId: "solana" },
    ];
    expect(matchChain(chains, { ...SOL, newsKeywords: [] })?.name).toBe("Solana");
    expect(matchChain(chains, { subject: "Ethereum", subjectType: "asset", symbols: [], newsKeywords: [] })?.name).toBe("Ethereum");
    expect(matchChain(chains, AI)).toBeNull();
  });
});

describe("verify links", () => {
  const links = async (dimension: keyof typeof COLLECTORS, ctx = context(SOL)) =>
    Object.fromEntries((await run(dimension, ctx)).map((f) => [f.id, f.verify ?? null]));

  it("links single-asset Bitget findings to the pair's chart", async () => {
    const chart = { url: "https://www.bitget.com/spot/SOLUSDT", label: "Bitget chart" };
    expect(await links("market_structure")).toEqual({
      "ms-price": chart,
      "ms-returns": chart,
      "ms-range": chart,
      "ms-volume": chart,
      "ms-relative": chart,
    });
    expect(Object.values(await links("technical")).every((l) => l?.url === chart.url)).toBe(true);
  });

  it("links positioning to the futures page or the exact public API request", async () => {
    expect(await links("positioning")).toEqual({
      "pos-funding-now": { url: "https://www.bitget.com/futures/usdt/SOLUSDT", label: "Bitget futures" },
      "pos-funding-history": {
        url: "https://api.bitget.com/api/v2/mix/market/history-fund-rate?productType=USDT-FUTURES&symbol=SOLUSDT&pageSize=21",
        label: "Bitget API data",
      },
      "pos-accounts": {
        url: "https://api.bitget.com/api/v2/mix/market/account-long-short?symbol=SOLUSDT&period=4h",
        label: "Bitget API data",
      },
      "pos-size": {
        url: "https://api.bitget.com/api/v2/mix/market/position-long-short?symbol=SOLUSDT&period=4h",
        label: "Bitget API data",
      },
      "pos-taker": {
        url: "https://api.bitget.com/api/v2/mix/market/taker-buy-sell?symbol=SOLUSDT&period=4h",
        label: "Bitget API data",
      },
    });
  });

  it("links sentiment and on-chain findings to the provider pages", async () => {
    expect(Object.values(await links("sentiment"))).toEqual([
      { url: "https://alternative.me/crypto/fear-and-greed-index/", label: "alternative.me" },
      { url: "https://alternative.me/crypto/fear-and-greed-index/", label: "alternative.me" },
    ]);
    expect(await links("onchain")).toEqual({
      "chain-tvl": { url: "https://defillama.com/chain/Solana", label: "DeFiLlama" },
      "chain-tvl-trend": { url: "https://defillama.com/chain/Solana", label: "DeFiLlama" },
      "chain-dex-volume": { url: "https://defillama.com/dexs/chain/solana", label: "DeFiLlama" },
      "chain-stablecoins": { url: "https://defillama.com/stablecoins", label: "DeFiLlama" },
      "chain-global": { url: "https://www.coingecko.com/en/charts", label: "CoinGecko" },
    });
  });

  it("omits links where no single checkable source exists", async () => {
    const basket = await links("market_structure", context(AI));
    expect(Object.values(basket).every((l) => l === null)).toBe(true);
  });

  it("keeps https article links from news feeds and drops anything else", async () => {
    const mcp: McpToolCaller = {
      callTool: async () =>
        success("Bitget Signal · news_feed", [
          {
            feed: "coindesk",
            items: [
              { title: "Solana DEX volume climbs", link: "https://www.coindesk.com/markets/solana-dex", published: "2026-09-15T08:00:00Z" },
              { title: "Suspicious item", link: "javascript:alert(1)", published: "2026-09-14T08:00:00Z" },
            ],
          },
        ]),
    };
    const findings = await run("news", context({ ...SOL, newsKeywords: ["Solana"] }, true, mcp));
    expect(findings.map((f) => f.verify ?? null)).toEqual([
      { url: "https://www.coindesk.com/markets/solana-dex", label: "CoinDesk" },
      null,
    ]);
  });
});
