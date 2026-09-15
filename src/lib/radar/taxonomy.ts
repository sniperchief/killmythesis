/**
 * NARRATIVE TAXONOMY — the curated narrative universe Narrative Radar measures.
 *
 * A narrative is a market theme measured through a basket of representative
 * assets. It is not an exhaustive list of every token in the sector.
 *
 * Every symbol below was verified on 2026-09-15 against Bitget public REST:
 * listed as a `<SYMBOL>USDT` spot pair with at least 40 daily candles
 * (`/api/v2/spot/market/candles?granularity=1day`). Tokens that were not listed
 * on Bitget spot at that time (e.g. AKT, MKR, OM, CFG, GRT, TON) are deliberately
 * left out. Illiquid pairs (under ~$5k 24h spot volume, e.g. DRIFT) were dropped.
 *
 * To add a narrative: pick 5–10 assets, verify each pair is listed with daily
 * candles, and add an entry. Nothing else needs to change.
 */

export interface NarrativeDefinition {
  /** URL-safe id, used in /radar/[id]. */
  id: string;
  name: string;
  /** One line on what the basket represents. */
  description: string;
  /** Bitget spot base tickers, most representative first. */
  assets: string[];
}

/** The market benchmark every narrative is measured against. */
export const BENCHMARK_SYMBOL = "BTC";

export const NARRATIVES: NarrativeDefinition[] = [
  {
    id: "ai-compute",
    name: "AI / Compute",
    description: "Decentralized AI networks, agents and compute marketplaces.",
    assets: ["TAO", "FET", "RENDER", "WLD", "VIRTUAL", "ARKM", "IO", "NMR"],
  },
  {
    id: "defi",
    name: "DeFi",
    description: "Lending, DEX and yield protocols.",
    assets: ["AAVE", "UNI", "CRV", "COMP", "PENDLE", "MORPHO", "SKY", "CAKE", "AERO", "RAY"],
  },
  {
    id: "perp-dex",
    name: "Perp DEX",
    description: "On-chain perpetual futures exchanges and aggregators.",
    assets: ["HYPE", "DYDX", "GMX", "JUP", "AEVO", "ORDER", "SNX"],
  },
  {
    id: "rwa",
    name: "RWA",
    description: "Real-world asset tokenization and on-chain credit.",
    assets: ["ONDO", "PLUME", "POLYX", "SYRUP", "CPOOL", "MANTRA", "RSR"],
  },
  {
    id: "layer-1",
    name: "Layer 1",
    description: "Alternative smart-contract base layers (BTC and ETH excluded).",
    assets: ["SOL", "ADA", "AVAX", "SUI", "APT", "NEAR", "DOT", "SEI", "HBAR", "ALGO"],
  },
  {
    id: "layer-2",
    name: "Layer 2",
    description: "Ethereum scaling networks.",
    assets: ["ARB", "OP", "POL", "STRK", "ZK", "IMX", "MANTA", "TAIKO", "METIS"],
  },
  {
    id: "memecoins",
    name: "Memecoins",
    description: "Community and meme tokens.",
    assets: ["DOGE", "SHIB", "PEPE", "WIF", "BONK", "FLOKI", "BRETT", "PENGU"],
  },
  {
    id: "gaming",
    name: "Gaming",
    description: "Gaming, metaverse and gaming-chain tokens.",
    assets: ["AXS", "SAND", "MANA", "GALA", "BEAM", "RONIN", "YGG", "SUPER", "PRIME"],
  },
  {
    id: "depin",
    name: "DePIN",
    description: "Decentralized physical infrastructure: storage, wireless, bandwidth.",
    assets: ["FIL", "AR", "HNT", "GRASS", "ANKR", "GLM", "JASMY"],
  },
  {
    id: "staking",
    name: "Liquid Staking & Restaking",
    description: "Liquid staking and restaking protocols (merged: too few listed assets to measure each separately).",
    assets: ["LDO", "JTO", "SSV", "ETHFI", "EIGEN", "REZ", "PUFFER", "SWELL"],
  },
  {
    id: "infrastructure",
    name: "Infrastructure",
    description: "Oracles and cross-chain interoperability.",
    assets: ["LINK", "PYTH", "API3", "TRB", "ZRO", "AXL", "W", "QNT"],
  },
];

export const getNarrativeDefinition = (id: string): NarrativeDefinition | null =>
  NARRATIVES.find((n) => n.id === id) ?? null;

/** Every symbol the radar requests: the benchmark plus each unique basket asset. */
export function universeSymbols(narratives: NarrativeDefinition[] = NARRATIVES): string[] {
  return [...new Set([BENCHMARK_SYMBOL, ...narratives.flatMap((n) => n.assets)])];
}
