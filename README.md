# killmythesis

**Bring me your trade idea. I'll try to prove you wrong.**

An AI research desk that stress-tests market ideas before you trade them. Built for the Bitget AI × Crypto Hackathon, Track 3 (AI Trading Desk / AI Research Workbench).

KillMyThesis is a research workstation, not a trading bot. It breaks a thesis into assumptions, researches each one with Bitget market data, and maps supporting and challenging evidence onto those assumptions. It returns a deterministic research verdict. The trading decision stays with the human.

## Setup

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run build && npm start   # or: npm run dev
```

| Env var | Purpose |
|---|---|
| `NEXT_PUBLIC_DATA_MODE=live` | Use the live research pipeline (the demo setting). `sample` replays labeled UI fixtures. |
| `ANTHROPIC_API_KEY` | Server-only key for thesis parsing, evidence mapping and brief writing. Never exposed to the browser. |

No Bitget account or API key is needed. KillMyThesis uses only public market data and never executes trades.

## Tests

```bash
npm test                          # unit tests, all network calls mocked
```

The live connector smoke test hits real Bitget and MCP endpoints and runs no LLM calls:

```powershell
$env:LIVE_CONNECTORS="1"; npx vitest run src/server/research/collectors.live.test.ts --silent=false
```

## Status

See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for verified integration details.

- **Kill My Thesis** runs on live data:
  - Market structure, technicals and positioning come from Bitget's public REST API.
  - Sentiment comes from alternative.me, and on-chain data from DeFiLlama and CoinGecko, called directly because the Bitget Signal server can't currently reach them.
  - News and macro use the Bitget Signal MCP server, and show as unavailable while it returns no data.
  - Run `npm run check:mcp` to check the server yourself.
- **Narrative Radar** runs on live Bitget data:
  - 11 curated narratives, each measured through a basket of verified Bitget spot assets (`src/lib/radar/taxonomy.ts`).
  - Breadth, momentum, relative performance vs BTC, volume and funding are computed deterministically, and so are the lifecycle stage and data confidence (`src/lib/radar/engine.ts`).
  - The AI only explains the calculated reading, and its explanation is rejected if it cites numbers or assets that aren't in the data.
  - "Form a thesis" and "Kill this thesis" hand the narrative to KillMyThesis as research context.
- **Research History** saves live briefs in this browser, including the originating narrative when research started from the radar.

## Code map

- `src/lib/types.ts`: the domain model
- `src/lib/scoring.ts`: the deterministic score and verdict, with the formula documented in the file
- `src/lib/research/`: client event stream, reducer and runners
- `src/server/connectors/`: Bitget REST client, MCP client, and payload readers
- `src/server/research/`: parser, collectors, mapper, synthesizer, pipeline and HTTP handler
- `src/server/llm/structured.ts`: server-only Anthropic structured-output calls
- `src/lib/radar/`: narrative taxonomy, the deterministic radar engine, and the thesis handoff
- `src/server/radar/`: market-data collection, snapshot cache, AI explainer, and narrative research context
- `src/lib/dev/`: sample fixtures, used only when `NEXT_PUBLIC_DATA_MODE=sample`
