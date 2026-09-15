/**
 * Readers that extract specific values from Bitget Signal MCP payloads (news, macro).
 *
 * During development (2026-09-15) the server returned only failure payloads for
 * these tools, so success shapes could not be observed. Readers therefore look
 * for specific, meaningful field names and return null when they are absent.
 * A null reader result is reported as "unrecognized response", never guessed around.
 * (Sentiment and on-chain data come from providers called directly: see public-data.ts.)
 */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[%,]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Depth-first walk over every plain object in a payload (bounded). */
export function* records(payload: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 6) return;
  if (Array.isArray(payload)) {
    for (const item of payload.slice(0, 500)) yield* records(item, depth + 1);
  } else if (isRecord(payload)) {
    yield payload;
    for (const value of Object.values(payload)) yield* records(value, depth + 1);
  }
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const n = toNumber(record[key]);
    if (n !== null) return n;
  }
  return null;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Accepts unix seconds, unix ms, or date strings. */
export function toIsoTimestamp(v: unknown): string | null {
  const n = toNumber(v);
  let date: Date | null = null;
  if (n !== null) {
    if (n > 1e12) date = new Date(n);
    else if (n > 1e9) date = new Date(n * 1000);
  } else if (typeof v === "string") {
    date = new Date(v);
  }
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

const TIME_KEYS = ["timestamp", "time", "date", "published", "pubDate", "published_at", "updated", "updated_at"];

function timestampOf(record: Record<string, unknown>): string | null {
  for (const key of TIME_KEYS) {
    const iso = toIsoTimestamp(record[key]);
    if (iso) return iso;
  }
  return null;
}

// ─── news_feed ───────────────────────────────────────────────────────────────

export interface Headline {
  title: string;
  outlet: string;
  url: string | null;
  publishedAt: string | null;
}

const OUTLETS: Record<string, string> = {
  cointelegraph: "Cointelegraph",
  coindesk: "CoinDesk",
  decrypt: "Decrypt",
  blockworks: "Blockworks",
  the_defiant: "The Defiant",
};

/** Headlines from `[{ feed, items: [{ title, link, published }] }]`. */
export function readHeadlines(payload: unknown): Headline[] {
  if (!Array.isArray(payload)) return [];
  const seen = new Set<string>();
  const headlines: Headline[] = [];
  for (const feed of payload) {
    if (!isRecord(feed) || !Array.isArray(feed.items)) continue;
    const feedKey = typeof feed.feed === "string" ? feed.feed : "";
    for (const item of feed.items) {
      if (!isRecord(item)) continue;
      const title = firstString(item, ["title", "headline"]);
      if (!title || seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      headlines.push({
        title,
        outlet: OUTLETS[feedKey] ?? (feedKey || "News feed"),
        url: firstString(item, ["link", "url"]),
        publishedAt: timestampOf(item),
      });
    }
  }
  return headlines.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ─── rates_yields / macro_indicators / cross_asset ───────────────────────────

/** Verified key names from the live `fed_funds` response (values were null at the time). */
export function readFedFunds(payload: unknown): { effective: number | null; upper: number | null; lower: number | null } | null {
  if (!isRecord(payload)) return null;
  const effective = toNumber(payload.effective_fed_funds);
  const upper = toNumber(payload.target_upper);
  const lower = toNumber(payload.target_lower);
  return effective === null && upper === null ? null : { effective, upper, lower };
}

export function readLatestRelease(payload: unknown): { value: number; date: string | null; yoy: number | null } | null {
  for (const record of records(payload)) {
    const value = firstNumber(record, ["value", "latest_value", "latest"]);
    if (value === null) continue;
    return {
      value,
      date: firstString(record, ["date", "period", "release_date", "observation_date"]),
      yoy: firstNumber(record, ["yoy", "yoy_pct", "change_yoy", "yoy_change_pct"]),
    };
  }
  return null;
}

export function readCorrelations(payload: unknown): { target: string; correlation: number }[] {
  const out: { target: string; correlation: number }[] = [];
  for (const record of records(payload)) {
    const target = firstString(record, ["target", "asset", "name"]);
    const correlation = firstNumber(record, ["correlation", "full_period_correlation", "pearson", "corr"]);
    if (target && correlation !== null && correlation >= -1 && correlation <= 1) out.push({ target, correlation });
  }
  return out;
}
