/**
 * MARKET RESEARCH → deterministic findings, one collector per dimension.
 *
 * Collectors call connectors, validate what came back, and write factual
 * observations with the numbers in them. No LLM runs here. A dimension counts
 * as researched only if at least one finding was built from validated data.
 *
 * Sources: Bitget public REST (market structure, technicals, positioning),
 * alternative.me / DeFiLlama / CoinGecko directly (sentiment, on-chain),
 * Bitget Signal MCP (news, macro).
 *
 * Verify links are attached only where a user can actually check the data
 * (page URLs checked 2026-09-15). Basket and macro findings have none.
 */
import type { DimensionId, VerifyLink } from "@/lib/types";
import { safeVerifyLink } from "@/lib/verify";
import { bitgetUrls, type Candle } from "@/server/connectors/bitget-rest";
import { PUBLIC_SOURCES, type ChainTvl } from "@/server/connectors/public-data";
import { readCorrelations, readFedFunds, readHeadlines, readLatestRelease } from "@/server/connectors/signal-readers";
import { failure, type ConnectorResult } from "@/server/connectors/types";
import { atrPercent, formatPct, formatPrice, macd, percentChange, rangePosition, rsi, sma } from "./indicators";
import type { Collector, CollectorContext, RawFinding, ResearchTarget } from "./types";

const BITGET = "Bitget Market API";
const SIGNAL = "Bitget Signal";
const CORE_NEWS_FEEDS = "cointelegraph,coindesk,decrypt,blockworks,the_defiant";
const DAY_MS = 86_400_000;

const pair = (symbol: string) => `${symbol}USDT`;
/** A difference between two percentages, in percentage points. */
const points = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)} pts`;
const iso = (ms: number) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null);

// ─── Verify links ────────────────────────────────────────────────────────────

const verify = {
  /** Symbols are normalized to [A-Z0-9] by the parser, so they are URL-safe. */
  spotChart: (symbol: string): VerifyLink => ({ url: `https://www.bitget.com/spot/${pair(symbol)}`, label: "Bitget chart" }),
  futuresPage: (symbol: string): VerifyLink => ({
    url: `https://www.bitget.com/futures/usdt/${pair(symbol)}`,
    label: "Bitget futures",
  }),
  /** The exact public request the finding was computed from. */
  bitgetApi: (url: string): VerifyLink => ({ url, label: "Bitget API data" }),
  fearGreed: { url: "https://alternative.me/crypto/fear-and-greed-index/", label: "alternative.me" } satisfies VerifyLink,
  defillamaChain: (chain: string): VerifyLink => ({
    url: `https://defillama.com/chain/${encodeURIComponent(chain)}`,
    label: "DeFiLlama",
  }),
  defillamaDex: (chain: string): VerifyLink => ({
    url: `https://defillama.com/dexs/chain/${encodeURIComponent(chain.toLowerCase())}`,
    label: "DeFiLlama",
  }),
  stablecoins: { url: "https://defillama.com/stablecoins", label: "DeFiLlama" } satisfies VerifyLink,
  global: { url: "https://www.coingecko.com/en/charts", label: "CoinGecko" } satisfies VerifyLink,
};

function usd(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function compact(n: number) {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

const change = (now: number, then: number) => (then > 0 ? ((now - then) / then) * 100 : null);

/** Returns data, or records the failure and returns null. */
function take<T>(ctx: CollectorContext, result: ConnectorResult<T>): T | null {
  if (result.ok) return result.data;
  ctx.failures.push(result);
  return null;
}

/** Applies a reader to a successful MCP payload; an unrecognized shape is recorded as malformed. */
function read<T>(ctx: CollectorContext, result: ConnectorResult<unknown>, reader: (payload: unknown) => T | null): T | null {
  const payload = take(ctx, result);
  if (payload === null) return null;
  const value = reader(payload);
  const empty = value === null || (Array.isArray(value) && value.length === 0);
  if (empty) {
    ctx.failures.push(failure(result.source, "malformed", "Unrecognized or empty response shape"));
    return null;
  }
  return value;
}

function symbolsOrFail(ctx: CollectorContext): string[] {
  if (ctx.target.symbols.length === 0) {
    ctx.failures.push(failure("Research planner", "not_listed", "No tradable symbol identified for this thesis"));
  }
  return ctx.target.symbols;
}

const dailyCandles = (ctx: CollectorContext, symbol: string, signal: AbortSignal) =>
  ctx.memo(`spot-1day-${symbol}`, () => ctx.rest.spotCandles(pair(symbol), "1day", 100, signal));

const fourHourCandles = (ctx: CollectorContext, symbol: string, signal: AbortSignal) =>
  ctx.memo(`spot-4h-${symbol}`, () => ctx.rest.spotCandles(pair(symbol), "4h", 100, signal));

const lastTs = (candles: Candle[]) => iso(candles[candles.length - 1].ts);

function finding(dimension: DimensionId, f: Omit<RawFinding, "dimension">): RawFinding {
  return { dimension, ...f };
}

// ─── Market structure ────────────────────────────────────────────────────────

const marketStructure: Collector = async (ctx, signal) => {
  const symbols = symbolsOrFail(ctx);
  if (symbols.length === 0) return [];
  const needsBtc = !symbols.includes("BTC");

  if (symbols.length > 1) {
    const [candleSets, btcResult] = await Promise.all([
      Promise.all(symbols.map(async (s) => ({ s, result: await dailyCandles(ctx, s, signal) }))),
      needsBtc ? dailyCandles(ctx, "BTC", signal) : Promise.resolve(null),
    ]);
    const perf = candleSets.flatMap(({ s, result }) => {
      const candles = take(ctx, result);
      const r30 = candles ? percentChange(candles.map((c) => c.close), 30) : null;
      return candles && r30 !== null ? [{ s, r30, ts: candles[candles.length - 1].ts }] : [];
    });
    if (perf.length === 0) return [];

    const up = perf.filter((p) => p.r30 > 0).length;
    const avg = perf.reduce((a, p) => a + p.r30, 0) / perf.length;
    // Basket findings combine several pairs, so there is no single page to verify against.
    const out = [
      finding("market_structure", {
        id: "ms-breadth",
        topic: "Basket breadth",
        source: `${BITGET} · daily spot candles (${perf.map((p) => pair(p.s)).join(", ")})`,
        observation: `${up} of ${perf.length} basket tokens are up over 30 days (basket selected by the thesis parser): ${perf
          .map((p) => `${p.s} ${formatPct(p.r30)}`)
          .join(", ")}. Average ${formatPct(avg)}.`,
        timestamp: iso(Math.max(...perf.map((p) => p.ts))),
        rawValue: { perf, averageReturn30d: avg },
      }),
    ];
    const btc = btcResult ? take(ctx, btcResult) : null;
    const btc30 = btc ? percentChange(btc.map((c) => c.close), 30) : null;
    if (btc && btc30 !== null) {
      out.push(
        finding("market_structure", {
          id: "ms-relative",
          topic: "Relative strength vs BTC",
          source: `${BITGET} · daily spot candles incl. BTCUSDT`,
          observation: `Basket average 30-day return ${formatPct(avg)} vs BTC ${formatPct(btc30)} (${points(avg - btc30)} relative).`,
          timestamp: lastTs(btc),
          rawValue: { basket30d: avg, btc30d: btc30 },
        }),
      );
    }
    return out;
  }

  const s = symbols[0];
  const chart = verify.spotChart(s);
  const [tickerResult, candleResult, btcResult] = await Promise.all([
    ctx.rest.spotTicker(pair(s), signal),
    dailyCandles(ctx, s, signal),
    needsBtc ? dailyCandles(ctx, "BTC", signal) : Promise.resolve(null),
  ]);
  const out: RawFinding[] = [];

  const ticker = take(ctx, tickerResult);
  if (ticker) {
    out.push(
      finding("market_structure", {
        id: "ms-price",
        topic: "Price & 24h activity",
        source: `${BITGET} · ${pair(s)} spot ticker`,
        observation: `${pair(s)} last traded at ${formatPrice(ticker.lastPr)} USDT, ${formatPct(ticker.change24h * 100)} over 24h, with ${usd(ticker.usdtVolume)} of 24h spot volume.`,
        timestamp: iso(ticker.ts),
        rawValue: ticker,
        verify: chart,
      }),
    );
  }

  const candles = take(ctx, candleResult);
  if (candles && candles.length >= 31) {
    const closes = candles.map((c) => c.close);
    const returns = [7, 30, 90]
      .map((bars) => ({ bars, r: percentChange(closes, bars) }))
      .filter((x): x is { bars: number; r: number } => x.r !== null);
    out.push(
      finding("market_structure", {
        id: "ms-returns",
        topic: "Returns",
        source: `${BITGET} · ${pair(s)} daily spot candles`,
        observation: `Returns from daily closes: ${returns.map((x) => `${x.bars}-day ${formatPct(x.r)}`).join(", ")}.`,
        timestamp: lastTs(candles),
        rawValue: returns,
        verify: chart,
      }),
    );

    const window = Math.min(90, candles.length);
    const range = rangePosition(candles, window);
    if (range) {
      out.push(
        finding("market_structure", {
          id: "ms-range",
          topic: `${window}-day range`,
          source: `${BITGET} · ${pair(s)} daily spot candles`,
          observation: `Price sits at ${range.position.toFixed(0)}% of its ${window}-day range (low ${formatPrice(range.low)}, high ${formatPrice(range.high)}).`,
          timestamp: lastTs(candles),
          rawValue: range,
          verify: chart,
        }),
      );
    }

    const vol7 = sma(candles.map((c) => c.quoteVolume), 7);
    const vol30 = sma(candles.map((c) => c.quoteVolume), 30);
    if (vol7 !== null && vol30) {
      out.push(
        finding("market_structure", {
          id: "ms-volume",
          topic: "Volume trend",
          source: `${BITGET} · ${pair(s)} daily spot candles`,
          observation: `Average daily spot volume over the last 7 days is ${(vol7 / vol30).toFixed(2)}× the 30-day average (${usd(vol7)} vs ${usd(vol30)}).`,
          timestamp: lastTs(candles),
          rawValue: { avg7d: vol7, avg30d: vol30 },
          verify: chart,
        }),
      );
    }

    const btc = btcResult ? take(ctx, btcResult) : null;
    const r30 = percentChange(closes, 30);
    const btc30 = btc ? percentChange(btc.map((c) => c.close), 30) : null;
    if (btc && r30 !== null && btc30 !== null) {
      out.push(
        finding("market_structure", {
          id: "ms-relative",
          topic: "Relative strength vs BTC",
          source: `${BITGET} · ${pair(s)} and BTCUSDT daily spot candles`,
          observation: `${s} 30-day return ${formatPct(r30)} vs BTC ${formatPct(btc30)} (${points(r30 - btc30)} relative).`,
          timestamp: lastTs(candles),
          rawValue: { asset30d: r30, btc30d: btc30 },
          verify: chart,
        }),
      );
    }
  }
  return out;
};

// ─── Technical conditions ────────────────────────────────────────────────────

const technical: Collector = async (ctx, signal) => {
  const symbols = symbolsOrFail(ctx);
  if (symbols.length === 0) return [];
  const s = symbols[0];
  const label = symbols.length > 1 ? `${s} (first basket token)` : s;
  const chart = verify.spotChart(s);
  const [dailyResult, h4Result] = await Promise.all([dailyCandles(ctx, s, signal), fourHourCandles(ctx, s, signal)]);
  const daily = take(ctx, dailyResult);
  const h4 = take(ctx, h4Result);
  const out: RawFinding[] = [];
  const source = `${BITGET} · ${pair(s)} spot candles, indicators computed locally`;

  const rsiDaily = daily ? rsi(daily.map((c) => c.close)) : null;
  const rsi4h = h4 ? rsi(h4.map((c) => c.close)) : null;
  if (rsiDaily !== null || rsi4h !== null) {
    const parts = [
      rsiDaily !== null ? `daily RSI(14) is ${rsiDaily.toFixed(1)}` : null,
      rsi4h !== null ? `4h RSI(14) is ${rsi4h.toFixed(1)}` : null,
    ].filter(Boolean);
    out.push(
      finding("technical", {
        id: "ta-rsi",
        topic: "Momentum (RSI)",
        source,
        observation: `For ${label}, ${parts.join("; ")}.`,
        timestamp: daily ? lastTs(daily) : h4 ? lastTs(h4) : null,
        rawValue: { rsiDaily, rsi4h },
        verify: chart,
      }),
    );
  }

  if (daily) {
    const closes = daily.map((c) => c.close);
    const close = closes[closes.length - 1];
    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    if (sma20 !== null && sma50 !== null) {
      out.push(
        finding("technical", {
          id: "ta-trend",
          topic: "Trend (moving averages)",
          source,
          observation: `${label} last close ${formatPrice(close)} is ${formatPct(((close - sma20) / sma20) * 100)} vs its 20-day SMA (${formatPrice(sma20)}) and ${formatPct(((close - sma50) / sma50) * 100)} vs its 50-day SMA (${formatPrice(sma50)}); the 20-day SMA is ${sma20 >= sma50 ? "above" : "below"} the 50-day.`,
          timestamp: lastTs(daily),
          rawValue: { close, sma20, sma50 },
          verify: chart,
        }),
      );
    }

    const m = macd(closes);
    if (m) {
      out.push(
        finding("technical", {
          id: "ta-macd",
          topic: "MACD",
          source,
          observation: `${label} daily MACD is ${m.macd >= m.signal ? "above" : "below"} its signal line; histogram ${m.histogram.toPrecision(3)} vs ${m.previousHistogram.toPrecision(3)} on the prior bar (${Math.abs(m.histogram) >= Math.abs(m.previousHistogram) ? "widening" : "narrowing"}).`,
          timestamp: lastTs(daily),
          rawValue: m,
          verify: chart,
        }),
      );
    }

    const atr = atrPercent(daily);
    if (atr !== null) {
      out.push(
        finding("technical", {
          id: "ta-atr",
          topic: "Volatility (ATR)",
          source,
          observation: `${label} daily ATR(14) is ${atr.toFixed(1)}% of price.`,
          timestamp: lastTs(daily),
          rawValue: { atrPercent: atr },
          verify: chart,
        }),
      );
    }
  }
  return out;
};

// ─── Funding & positioning ───────────────────────────────────────────────────

const positioning: Collector = async (ctx, signal) => {
  const symbols = symbolsOrFail(ctx);
  if (symbols.length === 0) return [];
  const s = symbols[0];
  const p = pair(s);
  const [tickerR, fundingR, accountR, positionR, takerR] = await Promise.all([
    ctx.rest.futuresTicker(p, signal),
    ctx.rest.fundingHistory(p, 21, signal),
    ctx.rest.accountLongShort(p, "4h", signal),
    ctx.rest.positionLongShort(p, "4h", signal),
    ctx.rest.takerBuySell(p, "4h", signal),
  ]);
  const out: RawFinding[] = [];

  const ticker = take(ctx, tickerR);
  if (ticker) {
    out.push(
      finding("positioning", {
        id: "pos-funding-now",
        topic: "Funding & open interest",
        source: `${BITGET} · ${p} USDT perpetual ticker`,
        observation: `${p} perpetual funding rate is ${(ticker.fundingRate * 100).toFixed(4)}% per settlement; open interest is ${compact(ticker.holdingAmount)} ${s} (≈${usd(ticker.holdingAmount * ticker.markPrice)} at mark).`,
        timestamp: iso(ticker.ts),
        rawValue: { fundingRate: ticker.fundingRate, openInterest: ticker.holdingAmount, markPrice: ticker.markPrice },
        verify: verify.futuresPage(s),
      }),
    );
  }

  const funding = take(ctx, fundingR);
  if (funding) {
    const avg = funding.reduce((a, f) => a + f.fundingRate, 0) / funding.length;
    const positive = funding.filter((f) => f.fundingRate > 0).length;
    out.push(
      finding("positioning", {
        id: "pos-funding-history",
        topic: "Funding history",
        source: `${BITGET} · ${p} funding rate history`,
        observation: `Across the last ${funding.length} funding settlements, the average rate was ${(avg * 100).toFixed(4)}% and ${positive} of ${funding.length} were positive.`,
        timestamp: iso(Math.max(...funding.map((f) => f.fundingTime))),
        rawValue: { average: avg, positive, count: funding.length },
        verify: verify.bitgetApi(bitgetUrls.fundingHistory(p, 21)),
      }),
    );
  }

  const accounts = take(ctx, accountR);
  if (accounts) {
    const last = accounts[accounts.length - 1];
    const dayAgo = accounts[Math.max(0, accounts.length - 7)];
    out.push(
      finding("positioning", {
        id: "pos-accounts",
        topic: "Long/short accounts",
        source: `${BITGET} · ${p} account long/short ratio (4h)`,
        observation: `${(last.longAccountRatio * 100).toFixed(1)}% of Bitget ${s} futures accounts are net long (long/short account ratio ${last.longShortAccountRatio.toFixed(2)}), vs ${dayAgo.longShortAccountRatio.toFixed(2)} ${Math.round((last.ts - dayAgo.ts) / 3_600_000)}h earlier.`,
        timestamp: iso(last.ts),
        rawValue: { latest: last, earlier: dayAgo },
        verify: verify.bitgetApi(bitgetUrls.accountLongShort(p, "4h")),
      }),
    );
  }

  const positions = take(ctx, positionR);
  if (positions) {
    const last = positions[positions.length - 1];
    out.push(
      finding("positioning", {
        id: "pos-size",
        topic: "Long/short by position size",
        source: `${BITGET} · ${p} position long/short ratio (4h)`,
        observation: `By position size, longs hold ${(last.longPositionRatio * 100).toFixed(1)}% of Bitget ${s} futures positions (ratio ${last.longShortPositionRatio.toFixed(2)}).`,
        timestamp: iso(last.ts),
        rawValue: last,
        verify: verify.bitgetApi(bitgetUrls.positionLongShort(p, "4h")),
      }),
    );
  }

  const taker = take(ctx, takerR);
  if (taker) {
    const recent = taker.slice(-6);
    const buy = recent.reduce((a, t) => a + t.buyVolume, 0);
    const sell = recent.reduce((a, t) => a + t.sellVolume, 0);
    if (sell > 0) {
      out.push(
        finding("positioning", {
          id: "pos-taker",
          topic: "Taker flow",
          source: `${BITGET} · ${p} taker buy/sell volume (4h)`,
          observation: `Over the last ${recent.length * 4}h, taker buy volume was ${(buy / sell).toFixed(2)}× taker sell volume on Bitget ${s} futures.`,
          timestamp: iso(recent[recent.length - 1].ts),
          rawValue: { buy, sell, periods: recent.length },
          verify: verify.bitgetApi(bitgetUrls.takerBuySell(p, "4h")),
        }),
      );
    }
  }
  return out;
};

// ─── Sentiment (alternative.me, called directly) ─────────────────────────────

const sentiment: Collector = async (ctx, signal) => {
  const readings = take(ctx, await ctx.publicData.fearGreed(14, signal));
  if (!readings) return [];

  const latest = readings[0];
  const oldest = readings[readings.length - 1];
  const out = [
    finding("sentiment", {
      id: "sent-fng",
      topic: "Fear & Greed (market-wide)",
      source: PUBLIC_SOURCES.fearGreed,
      observation: `The market-wide crypto Fear & Greed index reads ${latest.value} (${latest.label}).`,
      timestamp: iso(latest.timestamp),
      rawValue: latest,
      verify: verify.fearGreed,
    }),
  ];

  if (readings.length >= 2) {
    const values = readings.map((r) => r.value);
    out.push(
      finding("sentiment", {
        id: "sent-fng-trend",
        topic: "Fear & Greed trend (market-wide)",
        source: PUBLIC_SOURCES.fearGreed,
        observation: `Over the last ${readings.length} daily readings the Fear & Greed index moved from ${oldest.value} (${oldest.label}) to ${latest.value} (${latest.label}), ranging ${Math.min(...values)}–${Math.max(...values)}.`,
        timestamp: iso(latest.timestamp),
        rawValue: readings,
        verify: verify.fearGreed,
      }),
    );
  }
  return out;
};

// ─── On-chain / institutional (DeFiLlama + CoinGecko, called directly) ───────

/** Matches the thesis subject to a DeFiLlama chain by name, then (for single assets) by gas token. */
export function matchChain(chains: ChainTvl[], target: ResearchTarget): ChainTvl | null {
  const names = new Set([target.subject, ...target.newsKeywords].map((n) => n.toLowerCase()));
  const byName = chains.find((c) => names.has(c.name.toLowerCase()) || (c.geckoId !== null && names.has(c.geckoId)));
  if (byName) return byName;
  if (target.subjectType !== "asset") return null;
  return chains.find((c) => c.tokenSymbol !== null && target.symbols.includes(c.tokenSymbol.toUpperCase())) ?? null;
}

const onchain: Collector = async (ctx, signal) => {
  const { publicData, target } = ctx;
  const [chainsR, stablesR, globalR] = await Promise.all([
    publicData.chains(signal),
    publicData.stablecoins(signal),
    publicData.globalMarket(signal),
  ]);
  const out: RawFinding[] = [];

  const chains = take(ctx, chainsR);
  const chain = chains ? matchChain(chains, target) : null;
  if (chains && !chain && target.subjectType === "asset") {
    ctx.failures.push(failure(PUBLIC_SOURCES.chains, "empty", `No DeFi chain matches ${target.subject}`));
  }

  if (chains && chain) {
    out.push(
      finding("onchain", {
        id: "chain-tvl",
        topic: "Chain DeFi TVL",
        source: PUBLIC_SOURCES.chains,
        observation: `${chain.name} DeFi TVL is ${usd(chain.tvl)}, ranked #${chains.indexOf(chain) + 1} of ${chains.length} chains tracked.`,
        timestamp: null,
        rawValue: chain,
        verify: verify.defillamaChain(chain.name),
      }),
    );

    const [historyR, dexR] = await Promise.all([
      publicData.chainTvlHistory(chain.name, signal),
      publicData.chainDexVolume(chain.name, signal),
    ]);

    const history = take(ctx, historyR);
    if (history) {
      const last = history[history.length - 1];
      const before = (days: number) => [...history].reverse().find((p) => p.date <= last.date - days * DAY_MS) ?? null;
      const week = before(7);
      const month = before(30);
      const weekChange = week ? change(last.tvl, week.tvl) : null;
      const monthChange = month ? change(last.tvl, month.tvl) : null;
      const parts = [
        weekChange !== null ? `${formatPct(weekChange)} over 7 days` : null,
        monthChange !== null && month ? `${formatPct(monthChange)} over 30 days (${usd(month.tvl)} → ${usd(last.tvl)})` : null,
      ].filter(Boolean);
      if (parts.length) {
        out.push(
          finding("onchain", {
            id: "chain-tvl-trend",
            topic: "DeFi TVL trend",
            source: historyR.source,
            observation: `${chain.name} DeFi TVL changed ${parts.join(" and ")}.`,
            timestamp: iso(last.date),
            rawValue: { last, weekAgo: week, monthAgo: month },
            verify: verify.defillamaChain(chain.name),
          }),
        );
      }
    }

    const dex = take(ctx, dexR);
    if (dex) {
      const parts = [
        dex.total7d !== null
          ? `${usd(dex.total7d)} over the last 7 days${dex.change7dOver7dPct !== null ? ` (${formatPct(dex.change7dOver7dPct)} vs the prior 7 days)` : ""}`
          : null,
        dex.total30d !== null
          ? `${usd(dex.total30d)} over 30 days${dex.change30dOver30dPct !== null ? ` (${formatPct(dex.change30dOver30dPct)} vs the prior 30 days)` : ""}`
          : null,
      ].filter(Boolean);
      if (parts.length) {
        out.push(
          finding("onchain", {
            id: "chain-dex-volume",
            topic: "DEX volume trend",
            source: dexR.source,
            observation: `${chain.name} DEX volume was ${parts.join(", and ")}.`,
            timestamp: null,
            rawValue: dex,
            verify: verify.defillamaDex(chain.name),
          }),
        );
      }
    }
  }

  const stables = take(ctx, stablesR);
  if (stables) {
    const week = change(stables.totalUsd, stables.prevWeekUsd);
    const month = change(stables.totalUsd, stables.prevMonthUsd);
    const trend = [week !== null ? `${formatPct(week)} over 7 days` : null, month !== null ? `${formatPct(month)} over 30 days` : null]
      .filter(Boolean)
      .join(" and ");
    out.push(
      finding("onchain", {
        id: "chain-stablecoins",
        topic: "Stablecoin supply (market-wide)",
        source: PUBLIC_SOURCES.stablecoins,
        observation: `Total USD-pegged stablecoin supply is ${usd(stables.totalUsd)}${trend ? `, ${trend}` : ""}.`,
        timestamp: null,
        rawValue: stables,
        verify: verify.stablecoins,
      }),
    );
  }

  const global = take(ctx, globalR);
  if (global) {
    out.push(
      finding("onchain", {
        id: "chain-global",
        topic: "Market-wide capital",
        source: PUBLIC_SOURCES.global,
        observation: `Total crypto market cap is ${usd(global.totalMarketCapUsd)}${global.change24hPct !== null ? ` (${formatPct(global.change24hPct)} over 24h)` : ""}; BTC dominance is ${global.btcDominancePct.toFixed(1)}%${global.ethDominancePct !== null ? ` and ETH dominance ${global.ethDominancePct.toFixed(1)}%` : ""}.`,
        timestamp: iso(global.updatedAt),
        rawValue: global,
        verify: verify.global,
      }),
    );
  }
  return out;
};

// ─── News (Bitget Signal MCP) ────────────────────────────────────────────────

const news: Collector = async (ctx, signal) => {
  const keywords = ctx.target.newsKeywords.slice(0, 2);
  const results = await Promise.all(
    keywords.map((keyword) =>
      ctx.mcp.callTool("news_feed", { action: "latest", feeds: CORE_NEWS_FEEDS, keyword, limit: 5 }, signal),
    ),
  );
  const seen = new Set<string>();
  const headlines = results
    .flatMap((r) => read(ctx, r, readHeadlines) ?? [])
    .filter((h) => !seen.has(h.title.toLowerCase()) && seen.add(h.title.toLowerCase()))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, 6);

  return headlines.map((h, i) => {
    // The article link comes from an external feed: keep it only if it is a well-formed https URL.
    const articleLink = h.url ? safeVerifyLink({ url: h.url, label: h.outlet }) : null;
    return finding("news", {
      id: `news-${i + 1}`,
      topic: "Headline",
      source: `${SIGNAL} · news_feed · ${h.outlet}`,
      observation: `${h.outlet} headline: “${h.title}”`,
      timestamp: h.publishedAt,
      rawValue: h,
      ...(articleLink ? { verify: articleLink } : {}),
    });
  });
};

// ─── Macro (Bitget Signal MCP) ───────────────────────────────────────────────
// No verify links: the underlying series come through the MCP server with no public page reference.

const macro: Collector = async (ctx, signal) => {
  const [fedR, cpiR, corrR] = await Promise.all([
    ctx.mcp.callTool("rates_yields", { action: "fed_funds" }, signal),
    ctx.mcp.callTool("macro_indicators", { action: "latest_release", indicator: "cpi" }, signal),
    ctx.mcp.callTool("cross_asset", { action: "correlation", base: "btc", targets: "dxy,ndx", period: "90d", window: 30 }, signal),
  ]);
  const out: RawFinding[] = [];

  const fed = read(ctx, fedR, readFedFunds);
  if (fed) {
    const range = fed.lower !== null && fed.upper !== null ? ` (target range ${fed.lower}–${fed.upper}%)` : "";
    out.push(
      finding("macro", {
        id: "macro-fed",
        topic: "Policy rate",
        source: `${SIGNAL} · rates_yields`,
        observation: fed.effective !== null ? `The effective federal funds rate is ${fed.effective}%${range}.` : `The Fed funds target range is ${fed.lower}–${fed.upper}%.`,
        timestamp: null,
        rawValue: fed,
      }),
    );
  }

  const cpi = read(ctx, cpiR, readLatestRelease);
  if (cpi) {
    out.push(
      finding("macro", {
        id: "macro-cpi",
        topic: "Inflation (CPI)",
        source: `${SIGNAL} · macro_indicators`,
        observation: `Latest CPI release: ${cpi.value}${cpi.date ? ` (${cpi.date})` : ""}${cpi.yoy !== null ? `, ${cpi.yoy}% year over year` : ""}.`,
        timestamp: null,
        rawValue: cpi,
      }),
    );
  }

  const correlations = read(ctx, corrR, readCorrelations);
  if (correlations) {
    out.push(
      finding("macro", {
        id: "macro-corr",
        topic: "Cross-asset correlation",
        source: `${SIGNAL} · cross_asset`,
        observation: `90-day correlation of BTC with ${correlations.map((c) => `${c.target} ${c.correlation.toFixed(2)}`).join(", ")}.`,
        timestamp: null,
        rawValue: correlations,
      }),
    );
  }
  return out;
};

export const COLLECTORS: Record<DimensionId, Collector> = {
  market_structure: marketStructure,
  technical,
  positioning,
  sentiment,
  news,
  macro,
  onchain,
};
