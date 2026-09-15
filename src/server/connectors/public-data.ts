/**
 * Public, keyless market-intelligence providers called directly.
 *
 * These are the same providers the Bitget Signal MCP tools wrap. On 2026-09-15 the
 * MCP server could not reach them (empty errors / ConnectTimeout) while they answered
 * directly in under a second, so sentiment and on-chain research call them here.
 * Findings are labeled with the real provider, never as Bitget Signal.
 *
 * Shapes verified against live responses on 2026-09-15.
 */
import { z } from "zod";
import { TIMEOUTS } from "@/server/research/timeouts";
import { getJson } from "./json-http";
import type { FetchLike } from "./types";

const numericString = z
  .string()
  .min(1)
  .transform((s) => Number(s))
  .pipe(z.number());

// alternative.me — newest first: { data: [{ value: "69", value_classification: "Greed", timestamp: "1789430400" }] }
const FearGreedResponse = z
  .object({
    data: z
      .array(z.object({ value: numericString, value_classification: z.string().min(1), timestamp: numericString }))
      .min(1),
  })
  .transform(({ data }) =>
    data
      .map((d) => ({ value: d.value, label: d.value_classification, timestamp: d.timestamp * 1000 }))
      .sort((a, b) => b.timestamp - a.timestamp),
  );

// DeFiLlama /v2/chains — [{ name: "Solana", tvl: 5865624201, tokenSymbol: "SOL", gecko_id: "solana" }]
const ChainsResponse = z
  .array(
    z.object({
      name: z.string().min(1),
      tvl: z.number(),
      tokenSymbol: z.string().nullish(),
      gecko_id: z.string().nullish(),
    }),
  )
  .min(1)
  .transform((chains) =>
    chains
      .map((c) => ({ name: c.name, tvl: c.tvl, tokenSymbol: c.tokenSymbol ?? null, geckoId: c.gecko_id ?? null }))
      .sort((a, b) => b.tvl - a.tvl),
  );

// DeFiLlama /v2/historicalChainTvl/{chain} — [{ date: 1789430400, tvl: 5865376907 }] (unix seconds, ascending)
const TvlHistoryResponse = z
  .array(z.object({ date: z.number(), tvl: z.number() }))
  .min(2)
  .transform((points) => points.map((p) => ({ date: p.date * 1000, tvl: p.tvl })).sort((a, b) => a.date - b.date));

// DeFiLlama /overview/dexs/{chain} — { total24h, total7d, total30d, change_7dover7d, change_30dover30d, … }
const maybeNumber = z.number().nullish();
const DexVolumeResponse = z
  .object({
    total24h: maybeNumber,
    total7d: maybeNumber,
    total30d: maybeNumber,
    change_7dover7d: maybeNumber,
    change_30dover30d: maybeNumber,
  })
  .refine((d) => typeof d.total7d === "number" || typeof d.total30d === "number", "No DEX volume values")
  .transform((d) => ({
    total24h: d.total24h ?? null,
    total7d: d.total7d ?? null,
    total30d: d.total30d ?? null,
    change7dOver7dPct: d.change_7dover7d ?? null,
    change30dOver30dPct: d.change_30dover30d ?? null,
  }));

// DeFiLlama stablecoins — { peggedAssets: [{ circulating: { peggedUSD }, circulatingPrevWeek: {…}, circulatingPrevMonth: {…} }] }
const pegged = z.object({ peggedUSD: z.number().optional() }).nullish();
const StablecoinsResponse = z
  .object({
    peggedAssets: z
      .array(z.object({ circulating: pegged, circulatingPrevWeek: pegged, circulatingPrevMonth: pegged }))
      .min(1),
  })
  .transform(({ peggedAssets }) => {
    const total = (key: "circulating" | "circulatingPrevWeek" | "circulatingPrevMonth") =>
      peggedAssets.reduce((sum, asset) => sum + (asset[key]?.peggedUSD ?? 0), 0);
    return { totalUsd: total("circulating"), prevWeekUsd: total("circulatingPrevWeek"), prevMonthUsd: total("circulatingPrevMonth") };
  })
  .refine((t) => t.totalUsd > 0, "No USD-pegged supply");

// CoinGecko /global — { data: { total_market_cap: { usd }, market_cap_percentage: { btc, eth }, market_cap_change_percentage_24h_usd, updated_at } }
const GlobalResponse = z
  .object({
    data: z.object({
      total_market_cap: z.object({ usd: z.number() }),
      market_cap_percentage: z.object({ btc: z.number(), eth: z.number().optional() }),
      market_cap_change_percentage_24h_usd: z.number().nullish(),
      updated_at: z.number(),
    }),
  })
  .transform(({ data }) => ({
    totalMarketCapUsd: data.total_market_cap.usd,
    change24hPct: data.market_cap_change_percentage_24h_usd ?? null,
    btcDominancePct: data.market_cap_percentage.btc,
    ethDominancePct: data.market_cap_percentage.eth ?? null,
    updatedAt: data.updated_at * 1000,
  }));

export type FearGreedPoint = z.output<typeof FearGreedResponse>[number];
export type ChainTvl = z.output<typeof ChainsResponse>[number];

export const PUBLIC_SOURCES = {
  fearGreed: "alternative.me · Crypto Fear & Greed Index",
  chains: "DeFiLlama · chain TVL",
  stablecoins: "DeFiLlama · stablecoin supply",
  global: "CoinGecko · global market data",
} as const;

export function createPublicData(fetchImpl: FetchLike = fetch, timeoutMs: number = TIMEOUTS.publicMs) {
  const get = <S extends z.ZodType>(source: string, url: string, schema: S, signal?: AbortSignal) =>
    getJson(fetchImpl, source, url, schema, timeoutMs, signal);

  return {
    fearGreed: (days: number, signal?: AbortSignal) =>
      get(PUBLIC_SOURCES.fearGreed, `https://api.alternative.me/fng/?limit=${days}`, FearGreedResponse, signal),
    chains: (signal?: AbortSignal) => get(PUBLIC_SOURCES.chains, "https://api.llama.fi/v2/chains", ChainsResponse, signal),
    chainTvlHistory: (chain: string, signal?: AbortSignal) =>
      get(
        `DeFiLlama · ${chain} TVL history`,
        `https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(chain)}`,
        TvlHistoryResponse,
        signal,
      ),
    chainDexVolume: (chain: string, signal?: AbortSignal) =>
      get(
        `DeFiLlama · ${chain} DEX volume`,
        `https://api.llama.fi/overview/dexs/${encodeURIComponent(chain.toLowerCase())}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`,
        DexVolumeResponse,
        signal,
      ),
    stablecoins: (signal?: AbortSignal) =>
      get(PUBLIC_SOURCES.stablecoins, "https://stablecoins.llama.fi/stablecoins?includePrices=false", StablecoinsResponse, signal),
    globalMarket: (signal?: AbortSignal) =>
      get(PUBLIC_SOURCES.global, "https://api.coingecko.com/api/v3/global", GlobalResponse, signal),
  };
}

export type PublicData = ReturnType<typeof createPublicData>;
