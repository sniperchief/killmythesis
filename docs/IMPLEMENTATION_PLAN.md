# KillMyThesis — Implementation Plan

## 1. What Bitget actually provides

Verified against the live services on 2026-09-15.

| Resource | What it really is | How we use it |
|---|---|---|
| `@bitget-ai/bitget-signal` v1.2.0 | 5 `SKILL.md` prompt files plus an installer. There is no JS API. The installer registers a **public MCP server**. | The skills document which tools to call. We call those tools directly from the server. |
| Signal MCP server `https://datahub.noxiaohao.com/mcp` | MCP Streamable HTTP: `initialize` returns an `mcp-session-id` header, then `tools/call` responds over SSE. **No key, no account.** | `src/server/connectors/mcp-client.ts` |
| Bitget public REST `https://api.bitget.com/api/v2/...` | Tickers, candles, funding, open interest, long/short ratios and taker volume. **No key.** | `src/server/connectors/bitget-rest.ts` |
| `agent-cli` / `agent-skill` / `agent-mcp` / `agent-sdk` | Trading surface that requires API keys. | **Not used.** KillMyThesis never executes trades and never asks for keys. |

### Research dimension → data source

| Dimension | Bitget skill | Calls |
|---|---|---|
| Market structure | technical-analysis | REST spot ticker; daily spot candles for returns, range, volume, and relative strength vs BTC |
| Technical conditions | technical-analysis | REST spot candles (`1day`, `4h`); RSI, SMA, MACD and ATR computed locally |
| Funding & positioning | sentiment-analyst | REST futures ticker, funding history, `account-long-short`, `position-long-short`, `taker-buy-sell` |
| Sentiment | *(called directly)* | alternative.me Fear & Greed, current reading and 14-day trend (`/fng/?limit=14`) |
| News | news-briefing | MCP `news_feed`, keyword-filtered across core crypto outlets |
| Macro | macro-analyst | MCP `rates_yields(fed_funds)`, `macro_indicators(latest_release cpi)`, `cross_asset(correlation)` |
| On-chain / institutional | *(called directly)* | DeFiLlama: chain TVL, 7- and 30-day TVL trend, DEX volume trend, USD stablecoin supply trend. CoinGecko: total market cap, BTC and ETH dominance. |

**Why sentiment and on-chain bypass the MCP server.** `npm run check:mcp` showed the Bitget Signal server returning empty errors or timeouts for every one of these tools, and naming the provider URL it failed to reach. The same URLs answered from our machine in under 1s (`npm run check:mcp -- --upstream`). So we call those providers directly and label each finding with the real provider. Nothing is attributed to Bitget Signal that didn't come from it.

### Integrity hazards found while probing

- **Fake successes from MCP.** The server returns `isError: false` alongside failure payloads: `{"error": ""}`, `{"alt_me_error": ""}`, `{"error":"","url":…}`, all-null values with a `note`, a yield curve built from six `{error:""}` inputs, feeds with empty `items`, and `"Error executing tool …: ConnectTimeout"`. `unusableReason()` rejects all of these, and tests cover every one.
- **MCP data is currently broken.** During development, every intelligence tool (news, sentiment, derivatives sentiment, macro, DeFi, CoinGecko) returned one of those failure payloads or timed out, whether called concurrently or sequentially. Only the Binance/ccxt-backed `technical_analysis` and `crypto_derivatives` tools answered. As a result, the readers in `signal-readers.ts` target specific field names but have **not been verified against real success payloads**. An unrecognized shape is reported as `unavailable · unrecognized response`.
- **The MCP `technical_analysis` tool returned internally inconsistent values** (Bollinger upper below lower; support and resistance far below price), so technicals are computed locally from Bitget candles.
- **Granularity differs by endpoint.** Spot candles take `1day` / `4h`, while futures candles take `1D` / `4H`. The skill documentation's `1d` is rejected.
- **Unknown symbols return an error code, not an HTTP error.** Bitget returns `{"code":"40034","data":null}`, which the client maps to `not_listed`.
- **The MCP server degrades under heavy concurrency.** It failed under about 18 parallel calls. A full run now makes at most 5 MCP calls (news 2, macro 3), and all of them start immediately.

### LLM

`claude-haiku-4-5` is called through `@anthropic-ai/sdk`, server-side only, using `messages.parse` with Zod structured outputs. It is the cheapest current model at $1 in / $5 out per million tokens, chosen to keep hackathon costs down. Haiku 4.5 doesn't accept `effort` or adaptive thinking, so requests omit both, and server-side refusal fallbacks are not used. The key is `ANTHROPIC_API_KEY` in `.env.local`. When the key is missing, `/api/research` returns 503 with a configuration error, and there is no fallback of any kind.

## 2. Architecture (implemented)

```
POST /api/research                     src/app/api/research/route.ts → server/research/http.ts
  validate input (8–2000 chars)        400 on bad input; 503 if ANTHROPIC_API_KEY missing
  THESIS PARSER + PLAN (LLM)           server/research/parser.ts     → "parsed" or "clarification"
  COLLECTORS (concurrent)              server/research/collectors.ts → "source" running / ok / unavailable
     Bitget REST   8s per call         server/connectors/bitget-rest.ts
     Signal MCP   20s per call         server/connectors/mcp-client.ts + signal-readers.ts
     35s budget per dimension
  (all sources failed → "error", no brief)
  EVIDENCE MAPPING (LLM)               server/research/mapper.ts     facts copied from findings; the LLM only judges
  SCORING (deterministic)              lib/scoring.ts                unchanged from Phase 1
  SYNTHESIS (LLM)                      server/research/synthesizer.ts  guards block trade instructions and generic conditions
  → "brief" (mode: "live")             streamed as NDJSON to lib/research/live-runner.ts
```

**Verify links.** An evidence card shows "Verify · {label} ↗" only when the data can actually be checked. The target pages were confirmed on 2026-09-15.
- Bitget spot chart: single-asset price and technical findings.
- Bitget futures page: funding rate and open interest.
- The exact public Bitget API request: funding history, long/short ratios and taker flow.
- The alternative.me, DeFiLlama and CoinGecko pages for sentiment and on-chain findings.
- The article link for headlines, https only.
- Basket and macro findings get no link. Every link is re-checked as https-only before rendering, which also covers older history entries.

**Rules the code enforces:**
- A dimension shows ✓ only if at least one finding was built from validated data.
- Every finding's text, source and timestamp is produced deterministically.
- The LLM can't add evidence: judgments that reference unknown finding or assumption ids are dropped.
- A vague thesis returns a clarification and runs no research.
- Live mode always uses `liveRunner`. A sample brief received in live mode is discarded. A test asserts that no server module imports the sample fixtures.

## 3. Phases

1. **UI and visual system.** Done.
2. **Live pipeline.** Done, with the caveats below.
3. **Evaluation.** Mostly done in Phase 2: the evaluator, brief writer and invalidation conditions are wired. Remaining: tune prompts against real LLM output.
4. **Narrative Radar.** Live. See "Narrative Radar (live)" below.
5. **History, polish, errors, mobile, demo script.**

### Phase 2 status

**Verified:**
- 68 unit tests pass, plus 2 live connector smoke tests.
- Typecheck, lint and `next build` all pass.
- Live Bitget REST data flows through the market structure, technical and positioning collectors.
- Broken sources are reported truthfully: an unlisted symbol, a 1ms MCP timeout, and a wrong MCP endpoint.
- In the production server, `/api/research` returns 503 without a key and 400 on bad input.
- No server-only strings appear in client bundles.

**Not yet verified:**
- An end-to-end run with real Anthropic calls. No API key was available during development.
- MCP success-payload parsing, because the server returned no usable data.

### Narrative Radar (live)

```
/radar, /radar/[id]                    request-time render (connection()), loading.tsx while data loads
  getRadarSnapshot()                   server/radar/snapshot.ts   in-memory cache: 3 min, 30 s after an unusable cycle
    collectMarketUniverse()            server/radar/market-data.ts
       1 daily spot-candle request per unique symbol (BTC + ~91 basket assets), ~12 req/s, 30 s budget
       1 bulk futures-tickers call (open interest) + 1 bulk current-fund-rate call (funding + interval)
    buildRadarSnapshot()               lib/radar/engine.ts        deterministic; formulas documented in the file
  NarrativeExplanation (Suspense)      server/radar/explainer.ts  one Haiku call per narrative per snapshot, on the detail page only
```

- **Taxonomy.** `lib/radar/taxonomy.ts`. Every symbol was verified on 2026-09-15 as a listed Bitget spot pair with ≥ 40 daily candles. Unlisted tokens (AKT, MKR, OM, CFG, GRT, TON…) are left out. Liquid staking and restaking are merged because too few are listed to measure each separately.
- **Metrics.** Medians and counts, so one token can't define a narrative: median 7D and 30D returns, relative performance vs BTC, breadth, share beating BTC, week-over-week momentum and participation shifts, volume (last 7 complete days vs the prior 21), concentration, and funding normalized to 8h.
- **Coverage.** Below 50% of assets (or fewer than 3) the narrative is not classified. Between 50% and 74% it is classified with reduced confidence.
- **Lifecycle.** First matching rule wins: CROWDED, EXHAUSTING, ACCELERATING, EMERGING, FADING, STABLE. Thresholds are in `RADAR_RULES`. Data confidence (HIGH/MODERATE/LOW) comes from coverage, direction agreement and concentration. It is never a probability.
- **AI explanation.** The model gets pre-formatted facts only. Output is rejected if its summary cites a number that isn't in the facts, names an asset from another basket, claims a different stage, or contains a trade instruction. Offending bullets are dropped. With no API key the page says "AI explanation unavailable" and the metrics are unaffected.
- **Handoff.** `/?thesis=…&narrative=<id>` pre-fills the composer. `&run=1` is used only by "Kill this thesis", after the user has edited and confirmed the claim inline. The request sends only `narrativeId`, and the server resolves the context from the taxonomy and the cached snapshot. It feeds the parser as a separate `<narrative_context>` block, sets the research basket (when the thesis is still about the narrative), and adds two deterministic market-structure findings. `brief.origin` records the narrative for history.
- **Not used by the radar:** news, sentiment and on-chain data. The UI says so.

**Live smoke test:**

```
$env:LIVE_CONNECTORS="1"; npx vitest run src/server/research/collectors.live.test.ts --silent=false
```
