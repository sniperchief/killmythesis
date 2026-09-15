/**
 * Test-only builders for mocked connectors and LLM responses.
 * Imported by *.test.ts files only; never used by the application.
 */
import type { z } from "zod";
import type { BitgetRest, Candle } from "@/server/connectors/bitget-rest";
import type { PublicData } from "@/server/connectors/public-data";
import { failure, success, type ConnectorResult } from "@/server/connectors/types";
import type { StructuredLlm, StructuredRequest } from "@/server/llm/structured";
import type { ParserOutput } from "./parser";
import type { McpToolCaller } from "./types";

export const syntheticCandles = (count = 100): Candle[] =>
  Array.from({ length: count }, (_, i) => ({
    ts: 1_780_000_000_000 + i * 86_400_000,
    open: 100 + i * 0.5,
    high: 101 + i * 0.5,
    low: 99 + i * 0.5,
    close: 100.5 + i * 0.5,
    volume: 1_000,
    quoteVolume: 100_000 + i * 100,
  }));

const timeout = (source: string) => failure(source, "timeout", `${source} timed out after 8s`);

/** A REST fake where spot endpoints work and futures endpoints can be switched to fail. */
export function fakeRest(options: { spot?: boolean; futures?: boolean } = {}): BitgetRest {
  const spot = options.spot ?? true;
  const futures = options.futures ?? true;
  const candles = syntheticCandles();
  const when = <T>(enabled: boolean, source: string, data: T): Promise<ConnectorResult<T>> =>
    Promise.resolve(enabled ? success(source, data) : timeout(source));

  return {
    spotTicker: (symbol) =>
      when(spot, `Bitget spot ticker ${symbol}`, {
        symbol,
        lastPr: 150,
        high24h: 155,
        low24h: 145,
        change24h: 0.02,
        usdtVolume: 5e7,
        ts: candles[candles.length - 1].ts,
      }),
    spotCandles: (symbol, granularity) => when(spot, `Bitget spot candles ${symbol} ${granularity}`, candles),
    futuresCandles: (symbol, granularity) => when(futures, `Bitget futures candles ${symbol} ${granularity}`, candles),
    futuresTicker: (symbol) =>
      when(futures, `Bitget futures ticker ${symbol}`, {
        symbol,
        lastPr: 150,
        markPrice: 150,
        indexPrice: 150,
        fundingRate: 0.0001,
        holdingAmount: 4_000_000,
        change24h: 0.02,
        usdtVolume: 2e8,
        ts: candles[candles.length - 1].ts,
      }),
    fundingHistory: (symbol) =>
      when(futures, `Bitget funding history ${symbol}`, [
        { fundingRate: 0.0001, fundingTime: 1_780_000_000_000 },
        { fundingRate: -0.00002, fundingTime: 1_780_028_800_000 },
      ]),
    openInterest: (symbol) =>
      when(futures, `Bitget open interest ${symbol}`, { openInterestList: [{ symbol, size: 4_000_000 }], ts: 1_780_000_000_000 }),
    accountLongShort: (symbol) =>
      when(futures, `Bitget account long/short ${symbol}`, [
        { longAccountRatio: 0.78, shortAccountRatio: 0.22, longShortAccountRatio: 3.55, ts: 1_780_000_000_000 },
        { longAccountRatio: 0.8, shortAccountRatio: 0.2, longShortAccountRatio: 3.95, ts: 1_780_086_400_000 },
      ]),
    positionLongShort: (symbol) =>
      when(futures, `Bitget position long/short ${symbol}`, [
        { longPositionRatio: 0.495, shortPositionRatio: 0.505, longShortPositionRatio: 0.98, ts: 1_780_086_400_000 },
      ]),
    takerBuySell: (symbol) =>
      when(futures, `Bitget taker buy/sell ${symbol}`, [{ buyVolume: 100, sellVolume: 120, ts: 1_780_086_400_000 }]),
    futuresTickers: () =>
      when(futures, "Bitget futures tickers", [
        { symbol: "SOLUSDT", markPrice: 150, fundingRate: 0.0001, holdingAmount: 4_000_000, ts: 1_780_086_400_000 },
      ]),
    currentFundingRates: () =>
      when(futures, "Bitget current funding rates", [{ symbol: "SOLUSDT", fundingRate: 0.0001, fundingRateInterval: 8 }]),
  };
}

/** A fake of the directly called public providers (alternative.me, DeFiLlama, CoinGecko). */
export function fakePublicData(working = true): PublicData {
  const when = <T>(source: string, data: T): Promise<ConnectorResult<T>> =>
    Promise.resolve(working ? success(source, data) : failure(source, "http", "HTTP 503"));
  const day = 86_400_000;
  const now = 1_789_430_400_000;

  return {
    fearGreed: () =>
      when("alternative.me · Crypto Fear & Greed Index", [
        { value: 69, label: "Greed", timestamp: now },
        { value: 55, label: "Greed", timestamp: now - 7 * day },
        { value: 63, label: "Greed", timestamp: now - 13 * day },
      ]),
    chains: () =>
      when("DeFiLlama · chain TVL", [
        { name: "Ethereum", tvl: 49_972_163_774, tokenSymbol: "ETH", geckoId: "ethereum" },
        { name: "Solana", tvl: 5_865_624_201, tokenSymbol: "SOL", geckoId: "solana" },
      ]),
    chainTvlHistory: (chain) =>
      when(`DeFiLlama · ${chain} TVL history`, [
        { date: now - 30 * day, tvl: 5_000_000_000 },
        { date: now - 7 * day, tvl: 5_500_000_000 },
        { date: now, tvl: 5_865_376_907 },
      ]),
    chainDexVolume: (chain) =>
      when(`DeFiLlama · ${chain} DEX volume`, {
        total24h: 1_200_000_000,
        total7d: 8_000_000_000,
        total30d: 30_000_000_000,
        change7dOver7dPct: 12.5,
        change30dOver30dPct: -4.2,
      }),
    stablecoins: () =>
      when("DeFiLlama · stablecoin supply", { totalUsd: 311_960_000_000, prevWeekUsd: 310_770_000_000, prevMonthUsd: 306_790_000_000 }),
    globalMarket: () =>
      when("CoinGecko · global market data", {
        totalMarketCapUsd: 2_640_552_217_025,
        change24hPct: -2.73,
        btcDominancePct: 58.3,
        ethDominancePct: 11.4,
        updatedAt: now,
      }),
  };
}

/** An MCP fake that fails every call the way the live server did during development. */
export function failingMcp(calls: string[] = []): McpToolCaller {
  return {
    callTool: async (name) => {
      calls.push(name);
      return failure(`Bitget Signal · ${name}`, "upstream_error", "Upstream data source failed without a message");
    },
  };
}

export const SOL_PARSE: ParserOutput = {
  subject: "SOL",
  subjectType: "asset",
  stance: "LONG",
  statedReasons: ["ecosystem activity is getting stronger", "the pullback looks temporary"],
  symbols: ["sol"],
  coreThesis: "Solana ecosystem activity is strengthening and the pullback is temporary.",
  horizon: null,
  assumptions: [
    {
      text: "Solana ecosystem activity is strengthening.",
      kind: "adoption",
      dimensions: ["onchain", "news"],
      researchTasks: ["Check chain TVL", "Check ecosystem headlines"],
    },
    {
      text: "The current price decline is a temporary pullback.",
      kind: "price_action",
      dimensions: ["technical", "market_structure", "positioning"],
      researchTasks: ["Check trend and momentum", "Check funding and long/short positioning"],
    },
  ],
  newsKeywords: ["Solana", "SOL"],
  missing: [],
  clarification: "",
};

export const VAGUE_PARSE: ParserOutput = {
  subject: "ETH",
  subjectType: "asset",
  stance: "UNCLEAR",
  statedReasons: [],
  symbols: ["ETH"],
  coreThesis: "",
  horizon: null,
  assumptions: [],
  newsKeywords: [],
  missing: ["Direction (long or short)", "Reason for the view"],
  clarification: "What do you expect ETH to do, and why?",
};

type Responder = (request: StructuredRequest<z.ZodType>) => unknown;

/** A fake LLM that answers by request name and records every request it received. */
export function fakeLlm(responders: Record<string, Responder>, requests: StructuredRequest<z.ZodType>[] = []): StructuredLlm {
  return async (request) => {
    requests.push(request);
    const responder = responders[request.name];
    if (!responder) throw new Error(`Unexpected LLM request: ${request.name}`);
    return request.schema.parse(responder(request));
  };
}

/** Mapper responder: news/on-chain findings bear on A1, market findings on A2; technicals challenge. */
export const mapperResponder: Responder = (request) => {
  const { findings } = JSON.parse(request.prompt) as { findings: { findingId: string; dimension: string }[] };
  return {
    judgments: findings.map((f) => ({
      findingId: f.findingId,
      assumptionId: f.dimension === "news" || f.dimension === "onchain" ? "A1" : "A2",
      direction: f.dimension === "technical" ? "challenging" : "supporting",
      confidence: 0.7,
      relevance: 0.8,
      explanation: `Interpretation of ${f.findingId}.`,
    })),
  };
};

export const synthesisResponder: Responder = () => ({
  verdictSummary: "The price-action leg has mixed confirmation in the data that was available.",
  assumptionReasoning: [{ assumptionId: "A2", reasoning: "Market structure supports it while technicals challenge it." }],
  invalidation: [
    { condition: "Daily close below the 50-day SMA while funding stays positive.", dimension: "technical" },
    { condition: "Monitor the market.", dimension: "news" },
  ],
  conclusion: {
    strongestFor: "Returns remain positive over 30 days.",
    strongestAgainst: "Momentum readings are stretched.",
    summary: "The thesis is partly testable with the sources that responded; the weakest assumption is A1.",
  },
});
