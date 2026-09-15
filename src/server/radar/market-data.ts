/**
 * NARRATIVE RADAR DATA COLLECTION — one cycle for the whole universe.
 *
 * Request strategy (reuses the Phase 2 Bitget REST connector):
 *   - one daily spot-candle request per unique symbol (the benchmark plus every basket
 *     asset, deduplicated even when an asset belongs to several narratives)
 *   - one bulk futures-tickers request (open interest for every perpetual)
 *   - one bulk current-funding-rate request (funding rate + settlement interval)
 * Every narrative is then computed from this single dataset.
 *
 * Bitget limits public market endpoints per IP, so candle requests are paced
 * (bounded concurrency + a minimum spacing) and the whole cycle has a hard budget:
 * requests that cannot finish in time are recorded as timeouts, never filled in.
 */
import type { AssetCandles, AssetPositioning, MarketUniverse } from "@/lib/radar/types";
import { universeSymbols } from "@/lib/radar/taxonomy";
import type { BitgetRest } from "@/server/connectors/bitget-rest";
import { FAILURE_TEXT, failure, type ConnectorResult } from "@/server/connectors/types";
import { TimeoutError } from "@/server/research/timeouts";

export interface CollectionLimits {
  candleLimit: number;
  concurrency: number;
  spacingMs: number;
  budgetMs: number;
}

export const RADAR_COLLECTION: Readonly<CollectionLimits> = {
  /** 30-day returns need 31 closes; volume needs 28 complete days plus today's partial candle. */
  candleLimit: 45,
  concurrency: 6,
  /** Minimum spacing between candle request starts (≈ 12 requests/second). */
  spacingMs: 85,
  /** Hard budget for the whole cycle. */
  budgetMs: 30_000,
};

export interface CollectOptions {
  symbols?: string[];
  signal?: AbortSignal;
  now?: () => Date;
  limits?: Partial<CollectionLimits>;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

/** Resolves with the call's result, or with `onAbort()` as soon as the budget signal fires. */
function raceAbort<T>(task: Promise<T>, signal: AbortSignal, onAbort: () => T): Promise<T> {
  if (signal.aborted) return Promise.resolve(onAbort());
  return new Promise<T>((resolve) => {
    const abort = () => resolve(onAbort());
    signal.addEventListener("abort", abort, { once: true });
    task.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      () => {
        signal.removeEventListener("abort", abort);
        resolve(onAbort());
      },
    );
  });
}

async function paced<T, R>(
  items: T[],
  { concurrency, spacingMs }: { concurrency: number; spacingMs: number },
  signal: AbortSignal,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let lastSlot = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      const slot = Math.max(Date.now(), lastSlot + spacingMs);
      lastSlot = slot;
      await sleep(slot - Date.now(), signal);
      results[i] = await run(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  return results;
}

const reasonOf = (result: ConnectorResult<unknown>) => (result.ok ? "" : FAILURE_TEXT[result.reason]);

export async function collectMarketUniverse(rest: BitgetRest, options: CollectOptions = {}): Promise<MarketUniverse> {
  const limits = { ...RADAR_COLLECTION, ...options.limits };
  const symbols = options.symbols ?? universeSymbols();
  const fetchedAt = (options.now ?? (() => new Date()))().toISOString();

  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(new TimeoutError("Narrative Radar market data", limits.budgetMs)), limits.budgetMs);
  const onParentAbort = () => budget.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onParentAbort, { once: true });
  const budgetExceeded = (source: string) => () =>
    failure(source, "timeout", `${source} did not finish within the ${Math.round(limits.budgetMs / 1000)}s radar budget`);

  try {
    const futuresSource = "Bitget futures tickers";
    const fundingSource = "Bitget current funding rates";
    const [candleResults, tickers, funding] = await Promise.all([
      paced(symbols, limits, budget.signal, (symbol) => {
        const source = `Bitget spot candles ${symbol}USDT 1day`;
        return raceAbort(
          rest.spotCandles(`${symbol}USDT`, "1day", limits.candleLimit, budget.signal),
          budget.signal,
          budgetExceeded(source),
        );
      }),
      raceAbort(rest.futuresTickers(budget.signal), budget.signal, budgetExceeded(futuresSource)),
      raceAbort(rest.currentFundingRates(budget.signal), budget.signal, budgetExceeded(fundingSource)),
    ]);

    const candles: Record<string, AssetCandles> = {};
    symbols.forEach((symbol, i) => {
      const result = candleResults[i];
      candles[symbol] = result.ok
        ? {
            ok: true,
            candles: result.data.map(({ ts, close, quoteVolume }) => ({ ts, close, quoteVolume })),
            fetchedAt: result.fetchedAt,
          }
        : { ok: false, reason: reasonOf(result) };
    });

    const wanted = new Set(symbols.map((s) => `${s}USDT`));
    let positioning: Record<string, AssetPositioning> | null = null;
    let positioningNote: string | null = null;

    if (tickers.ok || funding.ok) {
      positioning = {};
      const fundingBySymbol = new Map(
        funding.ok ? funding.data.map((f) => [f.symbol, (f.fundingRate * 8) / f.fundingRateInterval] as const) : [],
      );
      const oiBySymbol = new Map(
        tickers.ok
          ? tickers.data.flatMap((t) => {
              const usd = t.holdingAmount * t.markPrice;
              return Number.isFinite(usd) && usd > 0 ? [[t.symbol, usd] as const] : [];
            })
          : [],
      );
      for (const pair of wanted) {
        const funding8h = fundingBySymbol.get(pair) ?? null;
        const openInterestUsd = oiBySymbol.get(pair) ?? null;
        if (funding8h !== null || openInterestUsd !== null) positioning[pair.slice(0, -4)] = { funding8h, openInterestUsd };
      }
      if (!funding.ok) positioningNote = `Funding rates unavailable (${reasonOf(funding)}); open interest only.`;
      else if (!tickers.ok) positioningNote = `Open interest unavailable (${reasonOf(tickers)}); funding rates only.`;
    } else {
      positioningNote = `Positioning unavailable (${reasonOf(tickers)}).`;
    }

    return { fetchedAt, candles, positioning, positioningNote };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onParentAbort);
  }
}
