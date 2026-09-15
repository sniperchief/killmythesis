#!/usr/bin/env node
/**
 * Diagnose the public Bitget Signal MCP server (the backend of @bitget-ai/bitget-signal).
 *
 *   npm run check:mcp                     all checks, one at a time
 *   npm run check:mcp -- sentiment        only checks whose label contains "sentiment"
 *   npm run check:mcp -- onchain --raw    print full payloads
 *   npm run check:mcp -- --upstream       call the public providers behind those tools directly
 *
 * Reading the result:
 *   USABLE        real values came back
 *   NO DATA       HTTP 200 + isError:false, but the payload is empty / an empty error (a fake success)
 *   TOOL ERROR    the tool reported an error (e.g. "ConnectTimeout" = the server couldn't reach its provider)
 *   TIMEOUT       nothing came back within TIMEOUT_MS
 *
 * If the control check works but the others don't, the MCP server is up and its upstream providers are failing.
 * If --upstream succeeds from your machine at the same time, the problem is on the Bitget Signal server, not your network.
 */

const MCP_URL = process.env.SIGNAL_MCP_URL ?? "https://datahub.noxiaohao.com/mcp";
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 40_000);

const CHECKS = [
  ["control: technical_analysis (known to work)", "technical_analysis", { action: "rsi", symbol: "BTC/USDT", timeframe: "1d" }],
  ["sentiment: fear & greed current", "sentiment_index", { action: "current" }],
  ["sentiment: fear & greed history", "sentiment_index", { action: "history", days: 7 }],
  ["sentiment: long/short ratio", "derivatives_sentiment", { action: "long_short", symbol: "BTCUSDT", period: "4h", limit: 3 }],
  ["sentiment: reddit trending", "derivatives_sentiment", { action: "reddit_trending", limit: 5 }],
  ["onchain: DeFi TVL by chain", "defi_analytics", { action: "chains", limit: 5 }],
  ["onchain: stablecoin supply", "defi_analytics", { action: "stablecoins" }],
  ["onchain: global market cap / BTC dominance", "crypto_market", { action: "global" }],
  ["onchain: ETH gas", "network_status", { action: "eth_gas" }],
  ["onchain: BTC fees", "network_status", { action: "btc_fees" }],
  ["onchain: BTC mempool", "network_status", { action: "btc_mempool" }],
  ["onchain: DEX pairs search", "dex_market", { action: "search", query: "solana", limit: 3 }],
  ["news: core crypto feeds", "news_feed", { action: "latest", feeds: "coindesk,decrypt,cointelegraph", limit: 2 }],
  ["macro: fed funds", "rates_yields", { action: "fed_funds" }],
];

// Public, keyless providers named in the MCP tool descriptions (CoinGecko, DeFiLlama, Fear & Greed, mempool).
const UPSTREAM = [
  ["Fear & Greed (alternative.me)", "https://api.alternative.me/fng/?limit=1"],
  ["DeFiLlama chains", "https://api.llama.fi/v2/chains"],
  ["DeFiLlama stablecoins", "https://stablecoins.llama.fi/stablecoins?includePrices=false"],
  ["CoinGecko global", "https://api.coingecko.com/api/v3/global"],
  ["DeFiLlama Solana TVL history", "https://api.llama.fi/v2/historicalChainTvl/Solana"],
  ["DeFiLlama Solana DEX volume", "https://api.llama.fi/overview/dexs/solana?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true"],
  ["mempool.space BTC fees", "https://mempool.space/api/v1/fees/recommended"],
];

const args = process.argv.slice(2);
const raw = args.includes("--raw");
const filters = args.filter((a) => !a.startsWith("--")).map((a) => a.toLowerCase());

const clip = (s, n = 260) => (s.length > n ? `${s.slice(0, n)}…` : s);

async function post(body, sessionId, timeoutMs = TIMEOUT_MS) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
  return { res, text: await res.text() };
}

function rpcFrom(text) {
  const t = text.trim();
  if (t.startsWith("{")) return JSON.parse(t);
  const data = t.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
  return data.length ? JSON.parse(data[data.length - 1]) : null;
}

function hasNumbers(v) {
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.some(hasNumbers);
  if (v && typeof v === "object") return Object.entries(v).some(([k, x]) => !/error$/i.test(k) && hasNumbers(x));
  return false;
}

function verdict(result) {
  if (!result) return "MALFORMED";
  const text = (result.content ?? []).map((c) => c.text ?? "").join("\n").trim();
  if (result.isError || /^error|error executing tool/i.test(text)) return "TOOL ERROR";
  if (!text) return "NO DATA";
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return "USABLE (text)";
  }
  if (Array.isArray(payload) && payload.every((p) => p && Array.isArray(p.items) && p.items.length === 0)) return "NO DATA";
  return hasNumbers(payload) || (Array.isArray(payload) && payload.some((p) => p?.items?.length)) ? "USABLE" : "NO DATA";
}

async function checkMcp() {
  console.log(`Bitget Signal MCP: ${MCP_URL}  (timeout ${TIMEOUT_MS / 1000}s per call)\n`);
  let sessionId = null;
  try {
    const started = Date.now();
    const init = await post(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "killmythesis-check", version: "1" } },
      },
      null,
      15_000,
    );
    sessionId = init.res.headers.get("mcp-session-id");
    const server = rpcFrom(init.text)?.result?.serverInfo;
    console.log(`Session: HTTP ${init.res.status}, server ${server?.name ?? "?"} ${server?.version ?? ""}, ${Date.now() - started}ms\n`);
    await post({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId, 15_000);
  } catch (err) {
    console.log(`Could not open an MCP session: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const selected = CHECKS.filter(([label]) => filters.length === 0 || filters.some((f) => label.includes(f)));
  let id = 2;
  for (const [label, name, toolArgs] of selected) {
    const started = Date.now();
    let status;
    let detail;
    try {
      const { res, text } = await post({ jsonrpc: "2.0", id: id++, method: "tools/call", params: { name, arguments: toolArgs } }, sessionId);
      const rpc = rpcFrom(text);
      status = res.ok ? verdict(rpc?.result) : `HTTP ${res.status}`;
      detail = rpc?.error ? `rpc error: ${rpc.error.message}` : (rpc?.result?.content ?? []).map((c) => c.text ?? "").join(" ");
    } catch (err) {
      status = err.name === "TimeoutError" ? "TIMEOUT" : "NETWORK";
      detail = err.message;
    }
    const secs = ((Date.now() - started) / 1000).toFixed(1).padStart(5);
    const mark = status.startsWith("USABLE") ? "✓" : "✗";
    console.log(`${mark} ${status.padEnd(13)} ${secs}s  ${label}  [${name}]`);
    console.log(`    ${raw ? detail : clip(detail ?? "")}\n`);
  }
}

async function checkUpstream() {
  console.log("Public providers, called directly from this machine:\n");
  for (const [label, url] of UPSTREAM) {
    const started = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" } });
      const text = await res.text();
      const secs = ((Date.now() - started) / 1000).toFixed(1).padStart(5);
      console.log(`${res.ok ? "✓" : "✗"} HTTP ${res.status} ${secs}s  ${label}\n    ${raw ? text : clip(text)}\n`);
    } catch (err) {
      console.log(`✗ ${err.name === "TimeoutError" ? "TIMEOUT" : "NETWORK"}  ${label}: ${err.message}\n`);
    }
  }
}

if (args.includes("--upstream")) await checkUpstream();
else await checkMcp();
