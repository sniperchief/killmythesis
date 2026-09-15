/**
 * Bitget public market REST API (no key). Used by the technical-analysis skill.
 *
 * Verified 2026-09-15:
 * - spot candles take granularity `1day` / `4h` (the skill doc's `1d` is rejected)
 * - futures candles take `1D` / `4H` (and reject `1day`)
 * - an unknown symbol returns `{"code":"40034","data":null}`
 * - every response uses the envelope `{ code: "00000", msg, data }`
 */
import { z } from "zod";
import { TIMEOUTS, withTimeout } from "@/server/research/timeouts";
import { failure, failureFromError, success, type ConnectorResult, type FetchLike } from "./types";

export const BITGET_BASE_URL = "https://api.bitget.com";

const Envelope = z.object({ code: z.string(), msg: z.string().optional(), data: z.unknown() });

/** A numeric string such as "102.55" → 102.55; rejects "", "abc", NaN. */
const numeric = z
  .string()
  .min(1)
  .transform((s) => Number(s))
  .pipe(z.number());

export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
}

const CandleRows = z
  .array(z.array(z.string()).min(7))
  .min(1)
  .transform((rows, ctx) => {
    const candles: Candle[] = [];
    for (const row of rows) {
      const [ts, open, high, low, close, volume, quoteVolume] = row.slice(0, 7).map(Number);
      if (![ts, open, high, low, close, volume, quoteVolume].every(Number.isFinite)) {
        ctx.addIssue({ code: "custom", message: "Non-numeric candle value" });
        return z.NEVER;
      }
      candles.push({ ts, open, high, low, close, volume, quoteVolume });
    }
    return candles.sort((a, b) => a.ts - b.ts);
  });

const SpotTickers = z
  .array(
    z.object({
      symbol: z.string(),
      lastPr: numeric,
      high24h: numeric,
      low24h: numeric,
      change24h: numeric,
      usdtVolume: numeric,
      ts: numeric,
    }),
  )
  .min(1);

const FuturesTickers = z
  .array(
    z.object({
      symbol: z.string(),
      lastPr: numeric,
      markPrice: numeric,
      indexPrice: numeric,
      fundingRate: numeric,
      holdingAmount: numeric,
      change24h: numeric,
      usdtVolume: numeric,
      ts: numeric,
    }),
  )
  .min(1);

const FundingHistory = z.array(z.object({ fundingRate: numeric, fundingTime: numeric })).min(1);

const OpenInterest = z.object({
  openInterestList: z.array(z.object({ symbol: z.string(), size: numeric })).min(1),
  ts: numeric,
});

const AccountLongShort = z
  .array(z.object({ longAccountRatio: numeric, shortAccountRatio: numeric, longShortAccountRatio: numeric, ts: numeric }))
  .min(1)
  .transform((rows) => rows.sort((a, b) => a.ts - b.ts));

const PositionLongShort = z
  .array(z.object({ longPositionRatio: numeric, shortPositionRatio: numeric, longShortPositionRatio: numeric, ts: numeric }))
  .min(1)
  .transform((rows) => rows.sort((a, b) => a.ts - b.ts));

const TakerBuySell = z
  .array(z.object({ buyVolume: numeric, sellVolume: numeric, ts: numeric }))
  .min(1)
  .transform((rows) => rows.sort((a, b) => a.ts - b.ts));

/**
 * Bulk endpoints return hundreds of rows; one odd row (e.g. a delisting contract with
 * empty fields) must not discard the rest. Rows that fail validation are dropped.
 */
function validRows<S extends z.ZodType>(row: S) {
  return z.array(z.unknown()).transform((rows, ctx) => {
    const valid = rows.flatMap((r) => {
      const parsed = row.safeParse(r);
      return parsed.success ? [parsed.data as z.output<S>] : [];
    });
    if (valid.length === 0) {
      ctx.addIssue({ code: "custom", message: "No valid rows" });
      return z.NEVER;
    }
    return valid;
  });
}

const FuturesMarketRows = validRows(
  z.object({ symbol: z.string(), markPrice: numeric, fundingRate: numeric, holdingAmount: numeric, ts: numeric }),
);

// Verified 2026-09-15: [{ symbol, fundingRate: "0.0001", fundingRateInterval: "8", nextUpdate, … }] for every USDT perpetual.
const CurrentFundingRows = validRows(
  z.object({ symbol: z.string(), fundingRate: numeric, fundingRateInterval: numeric.pipe(z.number().positive()) }),
);

export type SpotTicker = z.infer<typeof SpotTickers>[number];
export type FuturesMarketRow = z.output<typeof FuturesMarketRows>[number];
export type CurrentFundingRow = z.output<typeof CurrentFundingRows>[number];
export type FuturesTicker = z.infer<typeof FuturesTickers>[number];
export type FundingPoint = z.infer<typeof FundingHistory>[number];

export type SpotGranularity = "1day" | "4h";
export type FuturesGranularity = "1D" | "4H";
export type RatioPeriod = "1h" | "4h";

const query = (params: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();

/**
 * Exact public request URLs. Used both to fetch data and as "verify" links,
 * so a user opening the link sees the same response the research used.
 */
export const bitgetUrls = {
  spotTicker: (symbol: string) => `${BITGET_BASE_URL}/api/v2/spot/market/tickers?${query({ symbol })}`,
  spotCandles: (symbol: string, granularity: SpotGranularity, limit: number) =>
    `${BITGET_BASE_URL}/api/v2/spot/market/candles?${query({ symbol, granularity, limit })}`,
  futuresCandles: (symbol: string, granularity: FuturesGranularity, limit: number) =>
    `${BITGET_BASE_URL}/api/v2/mix/market/candles?${query({ productType: "USDT-FUTURES", symbol, granularity, limit })}`,
  futuresTicker: (symbol: string) =>
    `${BITGET_BASE_URL}/api/v2/mix/market/ticker?${query({ productType: "USDT-FUTURES", symbol })}`,
  /** Every USDT perpetual in one call. */
  futuresTickers: () => `${BITGET_BASE_URL}/api/v2/mix/market/tickers?${query({ productType: "USDT-FUTURES" })}`,
  /** Current funding rate and settlement interval (hours) for every USDT perpetual in one call. */
  currentFundingRates: () => `${BITGET_BASE_URL}/api/v2/mix/market/current-fund-rate?${query({ productType: "USDT-FUTURES" })}`,
  fundingHistory: (symbol: string, pageSize: number) =>
    `${BITGET_BASE_URL}/api/v2/mix/market/history-fund-rate?${query({ productType: "USDT-FUTURES", symbol, pageSize })}`,
  openInterest: (symbol: string) =>
    `${BITGET_BASE_URL}/api/v2/mix/market/open-interest?${query({ productType: "USDT-FUTURES", symbol })}`,
  accountLongShort: (symbol: string, period: RatioPeriod) =>
    `${BITGET_BASE_URL}/api/v2/mix/market/account-long-short?${query({ symbol, period })}`,
  positionLongShort: (symbol: string, period: RatioPeriod) =>
    `${BITGET_BASE_URL}/api/v2/mix/market/position-long-short?${query({ symbol, period })}`,
  takerBuySell: (symbol: string, period: RatioPeriod) =>
    `${BITGET_BASE_URL}/api/v2/mix/market/taker-buy-sell?${query({ symbol, period })}`,
};

export function createBitgetRest(fetchImpl: FetchLike = fetch, timeoutMs: number = TIMEOUTS.restMs) {
  async function get<S extends z.ZodType>(
    source: string,
    url: string,
    schema: S,
    signal?: AbortSignal,
  ): Promise<ConnectorResult<z.output<S>>> {
    try {
      const { status, text } = await withTimeout(
        source,
        timeoutMs,
        async (s) => {
          const res = await fetchImpl(url, {
            signal: s,
            cache: "no-store",
            headers: { Accept: "application/json" },
          });
          return { status: res.status, text: await res.text() };
        },
        signal,
      );

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return status >= 200 && status < 300
          ? failure(source, "malformed", `Non-JSON response (HTTP ${status})`)
          : failure(source, "http", `HTTP ${status}`);
      }

      const envelope = Envelope.safeParse(json);
      if (!envelope.success) return failure(source, "malformed", `Unexpected response shape (HTTP ${status})`);
      if (envelope.data.code !== "00000") {
        const reason = envelope.data.code === "40034" ? "not_listed" : "upstream_error";
        return failure(source, reason, `Bitget ${envelope.data.code}: ${envelope.data.msg ?? "error"}`);
      }
      if (status < 200 || status >= 300) return failure(source, "http", `HTTP ${status}`);
      if (envelope.data.data === null || envelope.data.data === undefined) {
        return failure(source, "empty", "Response contained no data");
      }

      const parsed = schema.safeParse(envelope.data.data);
      if (!parsed.success) return failure(source, "malformed", "Response data failed validation");
      return success(source, parsed.data);
    } catch (err) {
      return failureFromError(source, err);
    }
  }

  return {
    spotTicker: async (symbol: string, signal?: AbortSignal): Promise<ConnectorResult<SpotTicker>> => {
      const res = await get(`Bitget spot ticker ${symbol}`, bitgetUrls.spotTicker(symbol), SpotTickers, signal);
      return res.ok ? { ...res, data: res.data[0] } : res;
    },
    spotCandles: (symbol: string, granularity: SpotGranularity, limit: number, signal?: AbortSignal) =>
      get(`Bitget spot candles ${symbol} ${granularity}`, bitgetUrls.spotCandles(symbol, granularity, limit), CandleRows, signal),
    futuresCandles: (symbol: string, granularity: FuturesGranularity, limit: number, signal?: AbortSignal) =>
      get(
        `Bitget futures candles ${symbol} ${granularity}`,
        bitgetUrls.futuresCandles(symbol, granularity, limit),
        CandleRows,
        signal,
      ),
    futuresTicker: async (symbol: string, signal?: AbortSignal): Promise<ConnectorResult<FuturesTicker>> => {
      const res = await get(`Bitget futures ticker ${symbol}`, bitgetUrls.futuresTicker(symbol), FuturesTickers, signal);
      return res.ok ? { ...res, data: res.data[0] } : res;
    },
    futuresTickers: (signal?: AbortSignal) =>
      get("Bitget futures tickers", bitgetUrls.futuresTickers(), FuturesMarketRows, signal),
    currentFundingRates: (signal?: AbortSignal) =>
      get("Bitget current funding rates", bitgetUrls.currentFundingRates(), CurrentFundingRows, signal),
    fundingHistory: (symbol: string, pageSize: number, signal?: AbortSignal) =>
      get(`Bitget funding history ${symbol}`, bitgetUrls.fundingHistory(symbol, pageSize), FundingHistory, signal),
    openInterest: (symbol: string, signal?: AbortSignal) =>
      get(`Bitget open interest ${symbol}`, bitgetUrls.openInterest(symbol), OpenInterest, signal),
    accountLongShort: (symbol: string, period: RatioPeriod, signal?: AbortSignal) =>
      get(`Bitget account long/short ${symbol}`, bitgetUrls.accountLongShort(symbol, period), AccountLongShort, signal),
    positionLongShort: (symbol: string, period: RatioPeriod, signal?: AbortSignal) =>
      get(`Bitget position long/short ${symbol}`, bitgetUrls.positionLongShort(symbol, period), PositionLongShort, signal),
    takerBuySell: (symbol: string, period: RatioPeriod, signal?: AbortSignal) =>
      get(`Bitget taker buy/sell ${symbol}`, bitgetUrls.takerBuySell(symbol, period), TakerBuySell, signal),
  };
}

export type BitgetRest = ReturnType<typeof createBitgetRest>;
