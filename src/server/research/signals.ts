/**
 * MEASURABLE INVALIDATION SIGNALS (deterministic).
 *
 * Turns validated findings into metrics a thesis can be invalidated on. Thresholds come only
 * from the data itself or from the metric's own neutral line, never from the model:
 *   - zero for a change, a return, a relative return, funding or a MACD histogram
 *   - 1.00× for a ratio
 *   - 50% for a share or the midpoint of a price range
 *   - 50 for an oscillator (RSI, Fear & Greed)
 *   - the 20- and 50-day moving averages read from the candles, for price
 *
 * Only thresholds that would contradict the thesis's direction and have not already been
 * crossed are offered: for a bullish, narrative or question thesis a metric "falls below",
 * for a short thesis it "rises above". The model can only choose among these.
 */
import { z } from "zod";
import type { DimensionId, Stance } from "@/lib/types";
import { formatPct, formatPrice } from "./indicators";
import type { RawFinding } from "./types";

export type Comparator = "below" | "above";

export interface SignalThreshold {
  id: string;
  comparator: Comparator;
  value: number;
  text: string;
}

export interface MeasurableSignal {
  id: string;
  findingId: string;
  dimension: DimensionId;
  label: string;
  current: number;
  currentText: string;
  timestamp: string | null;
  thresholds: SignalThreshold[];
}

type Unit = "pct" | "pts" | "ratio" | "share" | "percentLevel" | "level" | "price" | "funding" | "raw";

export function formatValue(unit: Unit, n: number): string {
  switch (unit) {
    case "pct":
      return formatPct(n);
    case "pts":
      return `${n >= 0 ? "+" : ""}${n.toFixed(1)} pts`;
    case "ratio":
      return `${n.toFixed(2)}×`;
    case "share":
      return `${Math.round(n * 100)}%`;
    case "percentLevel":
      return `${Math.round(n)}%`;
    case "level":
      return Number.isInteger(n) ? String(n) : n.toFixed(1);
    case "price":
      return formatPrice(n);
    case "funding":
      return `${(n * 100).toFixed(4)}%`;
    case "raw":
      return n.toPrecision(3);
  }
}

interface Level {
  value: number;
  text?: string;
}

const finite = z.number().finite();

function build(
  finding: RawFinding,
  key: string | null,
  label: string,
  unit: Unit,
  current: number,
  levels: Level[],
): MeasurableSignal | null {
  if (!Number.isFinite(current)) return null;
  const id = key ? `${finding.id}:${key}` : finding.id;
  const thresholds = levels
    .filter((level) => Number.isFinite(level.value))
    .flatMap((level) =>
      (["below", "above"] as const).map((comparator) => ({
        id: `${id}:${comparator}:${level.value}`,
        comparator,
        value: level.value,
        text: level.text ?? formatValue(unit, level.value),
      })),
    );
  return {
    id,
    findingId: finding.id,
    dimension: finding.dimension,
    label,
    current,
    currentText: formatValue(unit, current),
    timestamp: finding.timestamp,
    thresholds,
  };
}

const change = (now: number, then: number) => ((now - then) / then) * 100;

/** Signals a finding supports; [] for findings without a measurable value (headlines, macro, ATR…). */
function extract(f: RawFinding, prefix: string): (MeasurableSignal | null)[] {
  const parse = <S extends z.ZodType>(schema: S): z.output<S> | null => {
    const result = schema.safeParse(f.rawValue);
    return result.success ? result.data : null;
  };

  switch (f.id) {
    case "ms-returns": {
      const rows = parse(z.array(z.object({ bars: finite, r: finite })));
      if (!rows) return [];
      return [30, 7].map((bars) => {
        const row = rows.find((x) => x.bars === bars);
        return row ? build(f, `${bars}d`, `${prefix}${bars}-day return`, "pct", row.r, [{ value: 0, text: "0%" }]) : null;
      });
    }
    case "ms-relative": {
      const v = parse(z.object({ asset30d: finite.optional(), basket30d: finite.optional(), btc30d: finite }));
      const own = v?.asset30d ?? v?.basket30d;
      if (!v || own === undefined) return [];
      const label = v.basket30d !== undefined ? "Basket 30-day return vs BTC" : `${prefix}30-day return vs BTC`;
      return [build(f, null, label, "pts", own - v.btc30d, [{ value: 0, text: "0 pts" }])];
    }
    case "ms-range": {
      const v = parse(z.object({ position: finite }));
      return v ? [build(f, null, `${prefix}position in its ${f.topic}`, "percentLevel", v.position, [{ value: 50, text: "the midpoint (50%)" }])] : [];
    }
    case "ms-volume": {
      const v = parse(z.object({ avg7d: finite, avg30d: finite.positive() }));
      return v ? [build(f, null, `${prefix}7-day vs 30-day average spot volume`, "ratio", v.avg7d / v.avg30d, [{ value: 1 }])] : [];
    }
    case "ms-breadth": {
      const v = parse(z.object({ perf: z.array(z.object({ r30: finite })).min(1) }));
      if (!v) return [];
      const up = v.perf.filter((p) => p.r30 > 0).length / v.perf.length;
      return [build(f, null, "Share of basket tokens up over 30 days", "share", up, [{ value: 0.5 }])];
    }
    case "ta-trend": {
      const v = parse(z.object({ close: finite, sma20: finite, sma50: finite }));
      if (!v) return [];
      return [
        build(f, null, `${prefix}daily close`, "price", v.close, [
          { value: v.sma50, text: `the 50-day SMA (${formatPrice(v.sma50)})` },
          { value: v.sma20, text: `the 20-day SMA (${formatPrice(v.sma20)})` },
        ]),
      ];
    }
    case "ta-rsi": {
      const v = parse(z.object({ rsiDaily: finite.nullable() }));
      return v?.rsiDaily != null ? [build(f, null, `${prefix}daily RSI(14)`, "level", v.rsiDaily, [{ value: 50 }])] : [];
    }
    case "ta-macd": {
      const v = parse(z.object({ histogram: finite }));
      return v ? [build(f, null, `${prefix}daily MACD histogram`, "raw", v.histogram, [{ value: 0, text: "0" }])] : [];
    }
    case "pos-funding-now": {
      const v = parse(z.object({ fundingRate: finite }));
      return v ? [build(f, null, `${prefix}perpetual funding rate`, "funding", v.fundingRate, [{ value: 0, text: "0%" }])] : [];
    }
    case "pos-funding-history": {
      const v = parse(z.object({ positive: finite, count: finite.positive() }));
      return v ? [build(f, null, `${prefix}share of positive funding settlements`, "share", v.positive / v.count, [{ value: 0.5 }])] : [];
    }
    case "pos-accounts": {
      const v = parse(z.object({ latest: z.object({ longAccountRatio: finite }) }));
      return v
        ? [build(f, null, `${prefix}share of futures accounts net long`, "share", v.latest.longAccountRatio, [{ value: 0.5 }])]
        : [];
    }
    case "pos-taker": {
      const v = parse(z.object({ buy: finite, sell: finite.positive() }));
      return v ? [build(f, null, `${prefix}taker buy/sell volume ratio`, "ratio", v.buy / v.sell, [{ value: 1 }])] : [];
    }
    case "sent-fng": {
      const v = parse(z.object({ value: finite }));
      return v ? [build(f, null, "Market-wide Fear & Greed index", "level", v.value, [{ value: 50 }])] : [];
    }
    case "chain-tvl-trend": {
      const point = z.object({ tvl: finite.positive() });
      const v = parse(z.object({ last: point, weekAgo: point.nullable(), monthAgo: point.nullable() }));
      if (!v) return [];
      return [
        v.monthAgo ? build(f, "30d", `${prefix}chain DeFi TVL, 30-day change`, "pct", change(v.last.tvl, v.monthAgo.tvl), [{ value: 0, text: "0%" }]) : null,
        v.weekAgo ? build(f, "7d", `${prefix}chain DeFi TVL, 7-day change`, "pct", change(v.last.tvl, v.weekAgo.tvl), [{ value: 0, text: "0%" }]) : null,
      ];
    }
    case "chain-dex-volume": {
      const v = parse(z.object({ change7dOver7dPct: finite.nullable() }));
      return v?.change7dOver7dPct != null
        ? [build(f, null, `${prefix}chain DEX volume, last 7 days vs prior 7`, "pct", v.change7dOver7dPct, [{ value: 0, text: "0%" }])]
        : [];
    }
    case "chain-stablecoins": {
      const v = parse(z.object({ totalUsd: finite, prevMonthUsd: finite.positive() }));
      return v
        ? [build(f, null, "USD stablecoin supply, 30-day change", "pct", change(v.totalUsd, v.prevMonthUsd), [{ value: 0, text: "0%" }])]
        : [];
    }
    case "radar-reading": {
      const v = parse(z.object({ metrics: z.object({ breadth: finite, relative7d: finite, outperformShare: finite }) }));
      if (!v) return [];
      return [
        build(f, "breadth", "Narrative breadth (share of assets up over 7 days)", "share", v.metrics.breadth, [{ value: 0.5 }]),
        build(f, "relative", "Narrative median 7-day return vs BTC", "pts", v.metrics.relative7d, [{ value: 0, text: "0 pts" }]),
        build(f, "participation", "Share of narrative assets beating BTC over 7 days", "share", v.metrics.outperformShare, [{ value: 0.5 }]),
      ];
    }
    default:
      return [];
  }
}

/** The comparator that would contradict a thesis with this stance. */
export const breakingComparator = (stance: Stance): Comparator => (stance === "SHORT" ? "above" : "below");

/**
 * Measurable signals for invalidation, keeping only thresholds that contradict the thesis and
 * have not been crossed yet. `symbol` prefixes asset-level labels (e.g. "SOL daily close").
 */
export function measurableSignals(findings: RawFinding[], stance: Stance, symbol?: string): MeasurableSignal[] {
  const breaking = breakingComparator(stance);
  const prefix = symbol ? `${symbol} ` : "";
  return findings
    .flatMap((f) => extract(f, prefix))
    .filter((s): s is MeasurableSignal => s !== null)
    .map((s) => ({
      ...s,
      thresholds: s.thresholds.filter(
        (t) => t.comparator === breaking && (breaking === "below" ? s.current > t.value : s.current < t.value),
      ),
    }))
    .filter((s) => s.thresholds.length > 0);
}

export function renderClause(signal: MeasurableSignal, threshold: SignalThreshold): string {
  return `${signal.label} ${threshold.comparator === "below" ? "falls below" : "rises above"} ${threshold.text} (now ${signal.currentText})`;
}

export function renderCondition(clauses: { signal: MeasurableSignal; threshold: SignalThreshold }[]): string {
  return `The thesis is weakened if ${clauses.map((c) => renderClause(c.signal, c.threshold)).join(" while ")}.`;
}
