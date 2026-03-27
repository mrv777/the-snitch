# The Snitch

**Autonomous on-chain forensic intelligence agent.** Detects suspicious trading activity, traces wallet connections through multi-hop graph traversal, and generates shareable intelligence reports — powered by the [Nansen CLI](https://docs.nansen.ai/nansen-cli/overview).

**Live demo:** [snitch.cookd.wtf](https://snitch.cookd.wtf)

![The Snitch](public/favicon-source.png)

## What It Does

The Snitch democratizes enterprise forensic tools (like Solidus Labs and Chainalysis) for free. It operates in three modes:

### Token Forensics
Input a token address → detect anomalous price movements → identify who bought/sold around the event → trace wallet connections → generate a Suspicion Score (0-100) with a full forensic report including AI narrative.

### Prediction Market Forensics
Analyze resolved Polymarket events → identify who profited most → trace those wallets → compute an Insider Score to assess whether anyone had advance knowledge of the outcome.

### Autonomous Monitor
Background monitoring that watches for smart money flows, large trades, flow reversals, and prediction market odds swings across Ethereum, Base, and Solana.

## Nansen CLI Endpoints Used

22 unique endpoints across 4 domains:

| Domain | Endpoints |
|--------|-----------|
| **Profiler** | trace, batch, compare, transactions, counterparties, related-wallets, pnl-summary, perp-positions, search |
| **Token** | flow-intelligence, who-bought-sold, dex-trades, ohlcv, info |
| **Smart Money** | dex-trades, netflow |
| **Prediction Market** | event-screener, pnl-by-market, top-holders, trades-by-address, market-screener, pnl-by-address |

## Tech Stack

- **Framework:** Next.js 15 (App Router, React 19)
- **Database:** SQLite (better-sqlite3) — cache, investigations, budget tracking
- **AI:** Google Gemini for narrative generation
- **Visualization:** d3-force for interactive wallet connection graphs
- **Deployment:** Docker Compose + Nginx
- **Testing:** Vitest (498 tests)

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm
- [Nansen CLI](https://docs.nansen.ai/nansen-cli/overview) (`npm install -g nansen-cli`)
- Nansen API key
- Gemini API key

### Setup

```bash
git clone https://github.com/mrv777/the-snitch.git
cd the-snitch
pnpm install

# Create .env from template
cp .env.example .env
# Fill in NANSEN_API_KEY and GEMINI_API_KEY

# Run dev server
pnpm dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NANSEN_API_KEY` | Yes | Nansen API key for CLI and REST fallback |
| `GEMINI_API_KEY` | Yes | Google Gemini API key for AI narratives |
| `GEMINI_MODEL` | No | AI model (default: `gemini-2.5-flash`) |
| `DAILY_CREDIT_CAP` | No | Daily Nansen credit budget (default: `2000`) |
| `SITE_URL` | No | Public URL for OG tags (default: `https://thesnitch.xyz`) |
| `MONITOR_INTERVAL_MS` | No | Monitor polling interval in ms (default: `900000`) |

### Scripts

```bash
pnpm dev          # Development server with Turbopack
pnpm build        # Production build
pnpm test         # Run all 498 tests
pnpm typecheck    # TypeScript type checking
pnpm lint         # ESLint
pnpm seed-demo    # Seed monitor with demo data
```

## Docker Deployment

```bash
docker compose build
docker compose up -d
```

The app runs on port 3000 by default. Use the included `nginx.conf` as a reverse proxy template with SSL termination.

## Architecture

```
app/
  api/investigate/token/     # Token investigation SSE endpoint
  api/investigate/prediction/ # Prediction market investigation
  api/monitor/               # Monitor event feed + poll trigger
  investigate/token/         # Token investigation UI
  investigate/prediction/    # Prediction market browser + investigation UI
  card-render/               # OG image rendering (Playwright screenshots)

lib/
  forensics/                 # Investigation orchestrators, scorers, timeline builders
  nansen/                    # CLI wrapper, REST fallback, typed endpoints
  cache/                     # SQLite cache + persistence layer
  budget/                    # Daily credit tracking
  rate-limit/                # IP-based rate limiting
  monitor/                   # Autonomous monitoring triggers
  image/                     # Card rendering + storage

components/                  # React components (graph, timeline, meter, etc.)
```

### Investigation Pipeline

1. **Phase 0 — Recon:** Fetch token info, OHLCV price data, who-bought-sold. Detect anomalous price movements.
2. **Phase 1 — Suspect Identification:** Cross-reference dex trades, smart money activity, flow intelligence. Rank suspects by volume + timing.
3. **Phase 2 — Deep Profiling:** Trace wallet connections, related wallets, PnL summaries, perp positions for top suspects.
4. **Phase 3 — Analysis:** Compute suspicion score across 5 evidence factors, build forensic timeline, generate AI narrative.

Results stream in real-time via Server-Sent Events (SSE) with progressive UI updates.

### Scoring System

The Suspicion Score (0-100) is a weighted combination of:

| Factor | Weight | What It Measures |
|--------|--------|------------------|
| Timing Advantage | 30% | How early suspects traded before the price move |
| Volume Concentration | 20% | Whether a few wallets dominated pre-move volume |
| Wallet Connections | 20% | Shared counterparties, funding sources, related wallets |
| Smart Money Labels | 15% | Whether suspects are labeled entities (funds, traders) |
| Profit Magnitude | 15% | Absolute and percentage profit from the event |

**Verdicts:** CLEAN (0-19) → INCONCLUSIVE (20-39) → NOTABLE (40-59) → SUSPICIOUS (60-79) → HIGHLY SUSPICIOUS (80-100)

## Supported Chains

- **Ethereum** — full support
- **Base** — full support
- **Solana** — full support (auto-detected from base58 address format)

## License

MIT
