# The Snitch — Implementation Plan

## Context

Building "The Snitch" — an autonomous on-chain forensic intelligence agent for the Nansen CLI Hackathon. It detects suspicious trading activity, traces wallet connections, and generates shareable intelligence reports. This is a new project in `nansen-ai2/` (empty repo), building on patterns from the Cookd submission (`../nansen-ai`). No deadline constraint — full scope (token forensics + prediction market + monitoring).

---

## Interview Decisions (all 12 rounds consolidated)

### Credit & Data Strategy
- **Pre-filter**: CoinGecko free API to check volatility before spending Nansen credits
- **Credits**: Confirmed ~6,110 on free plan (10x cost multiplier)
- **Cache**: Flat 24h TTL across all endpoints (hackathon acceptable)
- **Anomaly threshold**: Dynamic by market cap (20% large-cap, 50% mid-cap, 100% micro-cap)
- **Trace depth**: Depth 2 for top-1 suspect, depth 1 for suspects 2 & 3
- **Compare**: Always use `profiler compare` regardless of cost
- **Perp check**: Skip `perp-positions` for tokens with <$10M market cap
- **Labels**: Need to test `who-bought-sold` label richness; may reweight scoring factor
- **Chains**: Ethereum + Base + Solana

### Investigation Logic
- **Suspect ranking**: Weighted union — merge addresses from who-bought-sold, dex-trades, flow-intelligence; weight DEX-visible higher (traceable in Phase 2)
- **Suspect grouping**: Adaptive — cluster connected suspects, list unrelated individually
- **Timing precision**: Daily OHLCV to identify anomaly day, then dex-trades timestamps for intraday timing (no extra cost)
- **Error handling**: Retry once (2s delay), then graceful degradation (generate partial report)
- **Timeout**: 60s overall, 15s per individual CLI call

### Frontend & UX
- **Navigation**: Navigate to `/investigate/token/[address]` immediately (shareable URL from start), SSE streams results
- **Loading**: Real phase transitions with polished sub-step smoothing
- **Graph**: d3-force from the start (interactive in browser, Playwright screenshots for cards)
- **Token input**: Free CoinGecko API for name search dropdown; address-only fallback
- **Chain selection**: Auto-detect EVM vs Solana by format; EVM shows chain dropdown (Ethereum default)
- **Recent investigations**: Public feed showing all users' investigations
- **Stale data**: Show investigation age + "Re-investigate" button with credit cost warning
- **Mobile**: Fully responsive
- **Rate limit**: 5 investigations/day/IP, viewing cached reports unlimited

### AI & Sharing
- **Gemini model**: Configurable via `GEMINI_MODEL` env var, default `gemini-2.5-flash`
- **Narrative**: Score-aware (receives suspicion score to calibrate tone)
- **JSON output**: Strict structured output + retry on malformed response
- **Sharing**: OG meta tags (auto Twitter card preview) + manual download button + Web Intent
- **Disclaimer**: Legal disclaimer on all reports ("for research purposes only")

### Monitoring
- **Pre-seeded**: Seed SQLite with real Nansen data (2-3 poll cycles during dev ~300-450 credits)
- **Fake SSE**: Replay historical events on a timer for demo (saves credits)
- **PM mode**: Build regardless of endpoint cost

### Deployment
- **Stack**: Docker Compose on VPS (`89.167.91.96`) — nginx (SSL + static files) + Next.js standalone
- **Coexists**: With Cookd on same VPS, nginx routes by domain/subdomain
- **Card rendering**: Playwright (Chromium in Docker container)
- **Fonts**: Self-host Syne + JetBrains Mono (.woff2 in /public/fonts)
- **Credits exhausted**: Graceful degradation — cached reports stay accessible, new investigations disabled

---

## Phase 1: Foundation (~3h)

### 1.1 Project Scaffolding
- `pnpm create next-app` with App Router, TypeScript strict, Tailwind v4
- Configure `next.config.ts`: `output: "standalone"`, `serverExternalPackages: ["better-sqlite3", "playwright-core"]`
- Install dependencies:
  ```
  better-sqlite3 @types/better-sqlite3
  playwright-core
  @google/genai
  d3-force @types/d3-force
  ```
- Set up path aliases (`@/*` → root)
- Create `.env.example` with all env vars
- Initialize git repo

**Reuse from Cookd** (`../nansen-ai`):
- `next.config.ts` — standalone output pattern
- `tsconfig.json` — path alias config

### 1.2 Nansen CLI Client
**File**: `lib/nansen/client.ts`

Adapt from Cookd's `lib/nansen/client.ts`:
- `execFileAsync` with `nansen research` command
- 15s timeout per call (per interview decision)
- `NANSEN_API_KEY` passed via env
- REST API fallback (`https://api.nansen.ai/api/v1`) with exponential backoff
- Cache integration (check before exec, store after success)
- Standardized error codes (credits_exhausted, auth_failed, rate_limited, unavailable)

**File**: `lib/nansen/types.ts`
- Response types for all 22 endpoints

**Files**: `lib/nansen/endpoints/profiler.ts`, `token.ts`, `smart-money.ts`, `prediction.ts`
- Typed wrapper functions for each endpoint
- Each function builds CLI args and calls client
- Profiler: trace, batch, compare, transactions, counterparties, related-wallets, pnl-summary, perp-positions, search (9)
- Token: flow-intelligence, who-bought-sold, dex-trades, ohlcv, info (5)
- Smart Money: dex-trades, netflow (2)
- Prediction: pnl-by-market, pnl-by-address, trades-by-address, top-holders, market-screener, event-screener (6)

### 1.3 SQLite Cache & Database
**File**: `lib/cache/db.ts`

Adapt from Cookd's `lib/cache/db.ts`:
- `better-sqlite3` at `data/cache.db`
- WAL mode + 5s busy timeout
- Schema (from spec section 12):
  - `api_cache` (key, data JSON, created_at, ttl_seconds)
  - `investigations` (id, mode, subject_id, chain, suspicion_score, verdict, report_json, card_path, timeline_card_path, created_at, ttl_seconds)
  - `monitor_events` (id, event_type, subject_id, summary, data_json, investigated, created_at)
  - `rate_limits` (ip, timestamp)
  - `budget_tracking` (date, credits_used)
- Indexes on monitor_events(created_at), investigations(subject_id, mode), api_cache(created_at)

**File**: `lib/cache/queries.ts`
- Cache CRUD: get/set/clean for api_cache
- Investigation CRUD: save, getById, getRecent, getBySubject
- Monitor events: save, getRecent, markInvestigated
- Address always lowercased before storage

### 1.4 Budget Tracking
**File**: `lib/budget/tracker.ts`

Adapt from Cookd's pattern:
- `DAILY_BUDGET_CAP` from env (default 2000 credits)
- `recordCredits(amount)` — increment daily total
- `getBudgetStatus()` → { creditsUsed, remaining, canInvestigate }
- `canAfford(estimatedCost)` — check before investigation
- Graceful degradation: when exhausted, return specific error code

### 1.5 Rate Limiting
**File**: `lib/rate-limit/limiter.ts`

Adapt from Cookd:
- 5 investigations/day per IP
- IP from `x-forwarded-for` → `x-real-ip` → "unknown"
- SQLite-backed (survives restarts)
- Returns: `{ allowed, remaining, resetIn }`

### 1.6 Utilities
**File**: `lib/utils/address.ts` — Adapt from Cookd (ETH + SOL regex, detect EVM vs Solana, truncate)
**File**: `lib/utils/chain-detect.ts` — Adapt from Cookd (free RPC probe for EVM chains)
**File**: `lib/utils/format.ts` — Number formatting (compact $1.2M), date formatting, percentage formatting

---

## Phase 2: Token Forensics Engine (~4h)

### 2.1 Types
**File**: `lib/forensics/types.ts`
```typescript
interface ForensicReport {
  caseId: string              // case-YYYYMMDD-XXXX (random 4 hex chars)
  mode: 'token' | 'prediction'
  subject: { address: string, name: string, symbol: string, chain: string }
  suspicionScore: number       // 0-100
  verdict: Verdict             // HIGHLY_SUSPICIOUS | SUSPICIOUS | NOTABLE | INCONCLUSIVE | CLEAN
  anomaly: AnomalyWindow      // { date, priceChangePct, direction }
  suspects: Suspect[]          // ranked list
  clusters: SuspectCluster[]   // grouped connected suspects
  timeline: TimelineEvent[]    // ordered forensic events
  graph: WalletGraph           // nodes + edges for d3
  evidence: EvidenceItem[]     // individual evidence pieces with sub-scores
  narrative: AINarrative       // Gemini output
  metadata: { creditsUsed, phasesCompleted, duration, createdAt }
}
```

### 2.2 CoinGecko Pre-filter
**File**: `lib/external/coingecko.ts`
- Free API: `GET /api/v3/simple/token_price/{platform_id}?vs_currencies=usd&include_24hr_change=true`
- Also: `GET /api/v3/search?query={name}` for token name search
- Check 24h price change before spending Nansen credits
- Dynamic threshold: parse market cap from token info → 20% (>$100M), 50% ($1M-$100M), 100% (<$1M)

### 2.3 Token Investigator (4-Phase Orchestration)
**File**: `lib/forensics/token-investigator.ts`

**Phase 0: RECON** (3 parallel calls, ~30 credits)
```
Promise.all([
  tokenInfo(address, chain),        // 10 cr → metadata + market cap
  tokenOhlcv(address, chain, '1d'), // 10 cr → 90-day price history
  tokenWhoBoughtSold(address, chain) // 10 cr → recent buyers/sellers
])
```
- Detect anomaly windows using dynamic threshold (market cap from tokenInfo)
- If no anomaly → EARLY EXIT → return "CLEAN" report (saves ~370+ credits)
- Extract Nansen labels from who-bought-sold (test label richness here)

**Phase 1: SUSPECT IDENTIFICATION** (4 parallel calls, ~120 credits)
```
Promise.all([
  tokenFlowIntelligence(address, chain), // 10 cr
  tokenDexTrades(address, chain),        // 10 cr
  smartMoneyDexTrades(chain),            // 50 cr
  smartMoneyNetflow(chain)               // 50 cr
])
```
- Weighted union: merge addresses from all sources
- For each address: compute `timingAdvantage × volume` score
- DEX-visible addresses weighted 1.5x (traceable)
- Select top 3 suspects
- Use dex-trades timestamps to pinpoint intraday anomaly timing

**Phase 2: DEEP PROFILING** (5-9 calls, ~250-400 credits)
```
// Top suspect: depth 2 trace (~400 cr)
profilerTrace(suspect1, chain, depth=2, width=3)
profilerRelatedWallets(suspect1, chain)  // 10 cr

// All suspects: PnL
Promise.all(suspects.map(s => profilerPnlSummary(s, chain))) // 10 cr each

// Conditional: perp positions (skip if market cap < $10M)
if (marketCap > 10_000_000) profilerPerpPositions(suspect1) // 10 cr

// Conditional: compare (only if ≥2 suspects)
if (suspects.length >= 2) profilerCompare(suspect1, suspect2, chain) // ~50-100 cr

// Suspects 2 & 3: depth 1 trace OR related-wallets only
```
- Build wallet graph from trace + related-wallets + compare results
- Retry once on failure (2s delay), then degrade (mark section unavailable)

**Phase 3: ANALYSIS + REPORT** (0 credits)
- Compute suspicion score (Section 2.4)
- Build forensic timeline (Section 2.5)
- Build wallet graph (Section 2.6)
- Generate AI narrative (Phase 3, Section 3.1)
- Assemble ForensicReport object
- Save to SQLite investigations table
- Return report

### 2.4 Suspicion Scorer
**File**: `lib/forensics/suspicion-scorer.ts`

5 weighted factors (from spec section 6):
| Factor | Weight | Input |
|--------|--------|-------|
| Timing | 30% | Hours before price move suspects traded |
| Volume Concentration | 20% | % of pre-move volume from top 3 wallets |
| Wallet Connections | 20% | trace/compare/related-wallets overlap |
| Smart Money Labels | 15% | Nansen labels from who-bought-sold (may reweight if sparse) |
| Profit Magnitude | 15% | Suspect PnL vs historical average |

Each factor produces a 0-100 sub-score + evidence text.
Weighted sum → overall 0-100 score → verdict label.

Verdict mapping: 80-100 HIGHLY_SUSPICIOUS (red), 60-79 SUSPICIOUS (orange), 40-59 NOTABLE (amber), 20-39 INCONCLUSIVE (gray), 0-19 CLEAN (green).

### 2.5 Timeline Builder
**File**: `lib/forensics/timeline-builder.ts`
- Input: dex-trades, transactions, anomaly window, suspects
- Output: `TimelineEvent[]` sorted by timestamp
- Events: suspect buys (T-Xh), smart money activity, price move (T-0), suspect sells (T+Xh)
- Relative timestamps (T-6h, T+1h) anchored to the anomaly peak

### 2.6 Graph Builder
**File**: `lib/forensics/graph-builder.ts`
- Input: trace data, related-wallets, compare results
- Output: `{ nodes: GraphNode[], edges: GraphEdge[] }` for d3-force
- Node types: suspect (red), related (gray), funding-source (yellow), exchange (blue)
- Edge types: transaction, funding, shared-counterparty
- Truncated addresses + labels on nodes

---

## Phase 3: AI Narrative (~2h)

### 3.1 Narrative Generator
**File**: `lib/forensics/narrative-generator.ts`

- Model: `process.env.GEMINI_MODEL || 'gemini-2.5-flash'`
- SDK: `@google/genai` with `responseMimeType: 'application/json'` + `responseSchema`
- System prompt from spec section 8 (detective tone, no direct accusations, specific data)
- **Score-aware**: Pass suspicion score + verdict to Gemini as context for tone calibration
- Structured output schema:
  ```json
  {
    "caseNarrative": "string (3-5 paragraphs)",
    "keyFindings": ["string (<100 chars)", "string", "string"],
    "shareableLine": "string (<120 chars, tweet-ready)",
    "verdictLabel": "HIGHLY SUSPICIOUS | SUSPICIOUS | NOTABLE | INCONCLUSIVE | CLEAN"
  }
  ```
- Error handling: Strict parse → retry once with explicit prompt → fallback to programmatic narrative (template-based using evidence items)
- Fallback model: `gemini-2.5-flash-lite` (if primary fails twice)

---

## Phase 4: Frontend (~4h)

### 4.1 Root Layout & Theme
**File**: `app/layout.tsx`
- Self-hosted fonts: Syne (headings, bold/all-caps) + JetBrains Mono (data, monospace)
- Dark forensic theme: `#0A0A0A` background
- CSS variables for accent colors: green `#00FF88`, amber `#FFB800`, red `#FF4444`
- Legal disclaimer in footer
- Responsive meta tags

**File**: `app/globals.css`
- Tailwind v4 + custom theme tokens
- Forensic grain texture overlay (CSS noise)
- Animated elements (gauge, timeline pulses)

### 4.2 Landing Page
**File**: `app/page.tsx`
- Hero: "The Snitch — On-Chain Forensic Intelligence"
- Agent status bar: "Agent Status: ACTIVE — X events scanned, Y flagged"
- Mode selector: Token Forensics | Prediction Market | Monitor
- Token input with CoinGecko search dropdown + chain selector (EVM: ETH/Base, SOL auto-detect)
- Recent Investigations feed (public, all users) from SQLite
- Each investigation shows: token symbol, chain, verdict badge, suspicion score, time ago

**Components**:
- `components/ModeSelector.tsx` — Token | Prediction | Monitor tabs
- `components/TokenInput.tsx` — Address/name input + CoinGecko autocomplete + chain dropdown
- `components/RecentInvestigations.tsx` — Public feed with verdict badges

### 4.3 Investigation Page (Token)
**File**: `app/investigate/token/[address]/page.tsx` — SSR entry, fetch chain from query params
**File**: `app/investigate/token/[address]/investigation-view.tsx` — Client component

Flow:
1. Navigate to URL immediately (shareable from start)
2. POST to `/api/investigate/token/[address]` — returns SSE stream
3. Show staged loading with real phase transitions:
   - Phase 0: "Scanning price history..." → "Identifying anomalies..."
   - Phase 1: "Identifying suspects..." → "Analyzing trading patterns..."
   - Phase 2: "Tracing wallet connections..." → "Profiling suspects..."
   - Phase 3: "Analyzing evidence..." → "Generating intelligence report..."
4. Results render progressively as phases complete

**Result components**:
- `components/SuspicionMeter.tsx` — Animated 0-100 gauge with verdict label + color
- `components/ForensicTimeline.tsx` — Vertical timeline with T-Xh markers, suspect actions, price event
- `components/WalletGraph.tsx` — d3-force interactive graph (zoom, pan, drag, hover tooltips, click-to-copy)
- `components/EvidenceCard.tsx` — Individual evidence item (factor name, sub-score, description)
- `components/CaseNarrative.tsx` — AI narrative with detective styling
- `components/ShareButtons.tsx` — Share on X (Web Intent), Download card, Copy link
- `components/InvestigationLoading.tsx` — Staged progress with phase indicators

### 4.4 Investigation Page (Prediction Market)
**File**: `app/investigate/prediction/[eventId]/page.tsx`
**File**: `app/investigate/prediction/[eventId]/investigation-view.tsx`

Similar to token but:
- Shows event title, outcome, resolution date
- "Insider Score" instead of "Suspicion Score"
- Top profiters instead of suspects
- Timeline: position entry vs event resolution
- No wallet graph (cheaper profiler calls, no trace)

### 4.5 Prediction Market Browser
**File**: `app/investigate/prediction/page.tsx`
- List of recent resolved Polymarket events from `event-screener`
- Each event: title, outcome, resolution date, "Investigate" button
- Simple list (recent resolved only, last 30 days)

### 4.6 Monitor Dashboard
**File**: `app/monitor/page.tsx`
- Agent status: "ACTIVE — Last scan: X min ago — Y alerts pending"
- Live feed of events (pre-seeded + fake SSE replay)
- Event cards: type icon, summary text, timestamp, "Investigate" button
- Counter: "X events scanned, Y flagged"

**File**: `components/MonitorDashboard.tsx` — Event feed with SSE listener
**File**: `components/MonitorEventCard.tsx` — Individual event card

---

## Phase 5: Shareable Cards & OG Images (~3h)

### 5.1 Card Render Routes (Playwright targets)
**File**: `app/card-render/[caseId]/page.tsx` — Layout wrapper
**File**: `app/card-render/[caseId]/forensic-card.tsx` — Report card (1200x630)
**File**: `app/card-render/[caseId]/timeline-card.tsx` — Timeline card (1200x630)

Design from spec section 9:
- "CLASSIFIED" stripe colored by verdict
- Case number, token/event info
- Suspicion/Insider score bar
- Key findings (3 bullet points)
- Footer: thesnitch.xyz | Powered by Nansen | #NansenCLI

### 5.2 Playwright Renderer
**File**: `lib/image/renderer.ts`

Adapt from Cookd's singleton pattern:
- Lazy-load Chromium browser instance
- `renderCard(caseId, variant)` → navigate to `http://localhost:3000/card-render/${caseId}?variant=${variant}`
- Wait for d3-force simulation to settle (if graph variant) — `waitForSelector('.graph-ready')`
- Viewport: 1200x630
- Screenshot → PNG buffer
- 15s navigation timeout

**File**: `lib/image/storage.ts`
- Save to `public/images/${caseId}_${variant}.png`
- Render in background (async, non-blocking — return report JSON immediately)

### 5.3 OG Image Route
**File**: `app/api/og/[caseId]/route.ts`
- Serve pre-rendered PNG with correct content-type
- OG meta tags on investigation pages: `og:image` → `/api/og/${caseId}?variant=forensic`
- Cache headers: 24h for generated, 60s for fallback
- `twitter:card` = `summary_large_image`

---

## Phase 6: Prediction Market Forensics (~3h)

### 6.1 PM Investigator
**File**: `lib/forensics/prediction-investigator.ts`

**Phase 0: EVENT DISCOVERY** (2 calls)
- `event-screener` or `market-screener` → browse events
- User selects resolved event

**Phase 1: PROFIT ANALYSIS** (2 calls)
- `pnl-by-market(marketId)` → ranked profiters
- `top-holders(marketId)` → position holders
- Extract top 3 most profitable addresses

**Phase 2: WALLET TRACING** (6-8 calls, per top 2 profiters)
- `trades-by-address(address)` → trade timing
- `profiler pnl-summary(address)` → track record
- `profiler transactions(address)` → on-chain activity
- `profiler related-wallets(address)` → connected wallets
- Skip profiler trace (save credits, use related-wallets instead)

**Phase 3: ANALYSIS** (0 credits)
- Insider Score (0-100) — adapted scoring: timing of position entry vs resolution, profit magnitude, wallet connections
- Timeline: position entry → odds movement → resolution
- AI narrative: "Did someone know?"

### 6.2 PM-Specific API Route
**File**: `app/api/investigate/prediction/[eventId]/route.ts`
- Same SSE streaming pattern as token investigation
- PM-specific phases

---

## Phase 7: Autonomous Monitoring (~3h)

### 7.1 Monitor Watcher
**File**: `lib/monitor/watcher.ts`
- `pollOnce()` → call smart-money dex-trades + netflow + PM market-screener
- Check trigger conditions (Section 7.2)
- Save flagged events to `monitor_events` table
- Return new events

### 7.2 Trigger Definitions
**File**: `lib/monitor/triggers.ts`
- Large SM trade: >$100K single DEX trade
- Flow reversal: net flow direction change for top-100 token
- PM odds swing: >30% odds change in 24h
- SM accumulation: new position + >20% price move

### 7.3 Monitor API Routes
**File**: `app/api/monitor/poll/route.ts` — Trigger one poll cycle (for real polling during dev)
**File**: `app/api/monitor/events/route.ts` — SSE stream + fake replay from pre-seeded data

### 7.4 Pre-seeding
- Run 2-3 real poll cycles during development
- Save results to SQLite
- Fake SSE replays historical events on a timer (e.g., one event every 30s)

---

## Phase 8: Polish & Deploy (~3h)

### 8.1 Demo Preparation
- Research 3-4 tokens with known suspicious price movements (recent pumps/dumps/rugs)
- Run full investigations, cache results
- Find 2-3 interesting resolved Polymarket events
- Run PM investigations, cache results
- Run 2-3 monitor poll cycles for seeding

### 8.2 Docker & Deployment
**File**: `Dockerfile`
- Multi-stage: build → production
- Install Chromium for Playwright
- Install Nansen CLI (`npm i -g nansen-cli`)
- Copy standalone output + public assets

**File**: `docker-compose.yml`
```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    env_file: .env
    volumes: ["./data:/app/data"]  # Persist SQLite
  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - ./public/images:/usr/share/nginx/images  # Serve card PNGs
    depends_on: [app]
```

**File**: `nginx.conf`
- SSL termination (Let's Encrypt / Cloudflare)
- Proxy pass to Next.js on port 3000
- Serve `/images/` directly from disk (card PNGs)
- Gzip compression
- Route by domain (coexist with Cookd on same VPS)

### 8.3 Credit Exhaustion Handling
- Check budget before every investigation
- When exhausted: API returns 503 with `{ error: 'credits_exhausted', message: '...' }`
- Frontend shows: "New investigations temporarily unavailable. Browse existing reports below."
- All cached reports remain accessible indefinitely

### 8.4 X Thread
- 6-tweet thread per spec section 16
- Use real investigation results from demo tokens
- Attach report card images (downloaded from the tool)
- Tag @nansen_ai + #NansenCLI

---

## API Routes Summary

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/investigate/token/[address]` | POST | Token forensics (SSE stream) |
| `/api/investigate/prediction/[eventId]` | POST | PM forensics (SSE stream) |
| `/api/monitor/poll` | POST | Trigger one monitor cycle |
| `/api/monitor/events` | GET | SSE stream for monitor events |
| `/api/og/[caseId]` | GET | Serve OG card images |
| `/api/investigations/recent` | GET | Recent public investigations |
| `/api/search/token` | GET | CoinGecko token search proxy |

---

## Key Files to Reuse from Cookd (`../nansen-ai`)

| Cookd File | Adapt For | Changes |
|------------|-----------|---------|
| `lib/nansen/client.ts` | `lib/nansen/client.ts` | Same pattern, adjust timeout to 15s |
| `lib/cache/db.ts` | `lib/cache/db.ts` | New schema (investigations, monitor_events) |
| `lib/cache/queries.ts` | `lib/cache/queries.ts` | New query functions |
| `lib/image/renderer.ts` | `lib/image/renderer.ts` | Change card URLs, add graph wait |
| `lib/image/storage.ts` | `lib/image/storage.ts` | Change path pattern to caseId |
| `lib/budget/tracker.ts` | `lib/budget/tracker.ts` | Adjust credit costs, remove roast-specific logic |
| `lib/rate-limit/limiter.ts` | `lib/rate-limit/limiter.ts` | Change to 5/day, remove hourly |
| `lib/utils/address.ts` | `lib/utils/address.ts` | Same (ETH + SOL validation) |
| `lib/utils/chain-detect.ts` | `lib/utils/chain-detect.ts` | Same (free RPC probe) |
| `components/ShareButtons.tsx` | `components/ShareButtons.tsx` | Change tweet text, add OG URL |
| `next.config.ts` | `next.config.ts` | Same standalone + externals pattern |

---

## Verification Plan

### Unit Testing
- Suspicion scorer: test with known inputs → expected scores
- Timeline builder: test event ordering and relative timestamps
- Address validation: EVM, Solana, invalid inputs
- Graph builder: test node/edge generation from mock trace data

### Integration Testing
1. Run `nansen account` to verify credit balance
2. Test one call per key endpoint (measure actual credit cost):
   - `profiler trace --depth 1 --width 3`
   - `profiler compare`
   - `profiler batch --include balance`
   - One `prediction-market` endpoint
3. Verify CLI JSON output format for each endpoint

### End-to-End Testing
1. Start dev server: `pnpm dev`
2. Enter a known token address (e.g., recent memecoin pump on Ethereum)
3. Verify: loading states → results render → suspicion score → timeline → graph → narrative
4. Click "Share on X" → verify Web Intent opens with correct text
5. Click "Download Card" → verify 1200x630 PNG downloads
6. Visit investigation URL in incognito → verify OG card preview
7. Test rate limit: hit 5 investigations → verify 6th is blocked
8. Test credit exhaustion: set `DAILY_BUDGET_CAP=1` → verify graceful degradation
9. Test PM mode: browse events → select one → verify investigation flow
10. Test monitor: verify pre-seeded events appear → fake SSE delivers new events

### Deployment Testing
1. `docker compose build && docker compose up`
2. Verify nginx proxying + SSL
3. Verify card PNGs served from nginx
4. Verify SQLite persists across container restarts
5. Run full investigation on production to verify CLI auth

---

## First Action After Plan Approval

Update SPEC.md with all 46 interview decisions consolidated into the relevant spec sections (the user requested "interview me... then write the spec to the file").
