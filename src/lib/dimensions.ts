import type { DimensionId } from "./types";

/**
 * Research dimensions and the data source behind each one.
 * `skill` is the short source label shown on status rows: the bitget-signal skill
 * name where Bitget data or tools are used, otherwise the provider called directly.
 */
export const DIMENSIONS: Record<
  DimensionId,
  { label: string; skill: string; provider: string }
> = {
  market_structure: { label: "Market structure", skill: "technical-analysis", provider: "Bitget Market API" },
  technical: { label: "Technical conditions", skill: "technical-analysis", provider: "Bitget Market API" },
  positioning: { label: "Funding & positioning", skill: "sentiment-analyst", provider: "Bitget Signal" },
  sentiment: { label: "Sentiment", skill: "alternative.me", provider: "alternative.me Crypto Fear & Greed Index" },
  news: { label: "News", skill: "news-briefing", provider: "Bitget Signal" },
  macro: { label: "Macro", skill: "macro-analyst", provider: "Bitget Signal" },
  onchain: { label: "On-chain / institutional", skill: "defillama · coingecko", provider: "DeFiLlama and CoinGecko" },
};

export const DIMENSION_ORDER: DimensionId[] = [
  "market_structure",
  "technical",
  "positioning",
  "sentiment",
  "news",
  "macro",
  "onchain",
];

/** Dimensions that reflect what the market itself is doing (used for "market confirmation"). */
export const MARKET_DIMENSIONS: ReadonlySet<DimensionId> = new Set([
  "market_structure",
  "technical",
  "positioning",
]);
