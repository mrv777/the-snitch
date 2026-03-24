# The Snitch — Autonomous On-Chain Forensic Intelligence Agent

## SPEC v2.0 — Nansen CLI Hackathon Submission

**Updated 2026-03-23 with finalized design decisions from deep-dive interview.**

---

## 1. Concept

**The Snitch** is an autonomous on-chain forensic intelligence agent that detects suspicious trading activity, traces wallet connections through multi-hop graph traversal, and generates shareable intelligence reports — powered by the Nansen CLI.

Think of it as a free, consumer-facing version of what Solidus Labs ($$$) and Chainalysis ($$$$$) sell to exchanges and regulators. Solidus found insider trading in **56% of crypto token listings**. Their tool costs enterprise money. Ours is free.

### Two Forensic Modes

1. **Token Forensics**: Input a token → detect unusual price movements → trace who bought/sold first → map wallet connections → generate Suspicion Score + forensic report
2. **Prediction Market Forensics**: For Polymarket events → who profited most? → trace those wallets → did they know the outcome beforehand?

Plus an **Autonomous Monitoring** layer that continuously watches for notable events and auto-generates reports.

### Supported Chains

**Ethereum, Base, and Solana.** Auto-detect EVM vs Solana by address format (0x… = EVM, base58 = Solana). For EVM addresses, show a chain dropdown selector with Ethereum as default.

---

## 2. Why This Wins

### Competitive Analysis of Past Winners

| Winner | Pattern | What They Did Right |
|--------|---------|-------------------|
| #1 Polymarket copy-trading bot | **Autonomous agent** | Bot that ACTS, not just displays. Novel graph analysis. |
| #2 Non-USD stablecoin dashboard | **Underexplored niche** | Data nobody else tracks. Institutional insights. |

### What Cookd (Our Previous Submission) Got Wrong

- Entertainment, not alpha. Judges valued utility.
- One-shot input→output. Not autonomous or agent-like.
- 14 endpoints. Good but not maximal.

### What The Snitch Gets Right

| Dimension | How We Win |
|-----------|-----------|
| **Utility** | Democratizes enterprise forensic tools. Real alpha. |
| **Autonomy** | Background monitoring agent — not just on-demand. |
| **Nansen CLI surface area** | 22 unique endpoints across 4 domains (profiler, token, smart-money, prediction-market). |
| **Underused endpoints** | `profiler trace` (multi-hop BFS), `profiler batch`, `profiler compare`, `token flow-intelligence`, all prediction-market endpoints. |
| **Virality** | Every token crash generates detective threads on CT. We automate that. |
| **Visual impact** | "Classified intelligence brief" aesthetic. Shareable forensic report cards. |
| **No consumer competition** | Solidus/Chainalysis are enterprise-only. No free tool does this. |

---

## 3. Core User Flow

### Token Forensics Mode

```
1. User pastes token address (or searches by name via CoinGecko free API dropdown)
2. Chain handling:
   - Solana addresses (base58) auto-detected → no chain selector
   - EVM addresses (0x) → show chain dropdown (Ethereum default, Base available)
3. Navigation: Immediately navigate to /investigate/token/[address]?chain=X (shareable URL from start)
4. Loading: Real phase transitions streamed via SSE with polished sub-step smoothing
   - Phase 0: "Scanning price history..." → "Identifying anomalies..."
   - Phase 1: "Identifying suspects..." → "Analyzing trading patterns..."
   - Phase 2: "Tracing wallet connections..." → "Profiling suspects..."
   - Phase 3: "Analyzing evidence..." → "Generating intelligence report..."
5. Results render progressively as phases complete:
   - Suspicion Score (0-100) with animated gauge
   - Forensic timeline (who did what, when — intraday precision via dex-trades timestamps)
   - Wallet connection graph (d3-force interactive: zoom, pan, drag, hover tooltips)
   - Evidence items (timing, volume, connections, labels — each with sub-score)
   - AI-generated case narrative (detective tone, score-aware calibration)
   - Verdict label (HIGHLY SUSPICIOUS / SUSPICIOUS / NOTABLE / INCONCLUSIVE / CLEAN)
6. Share: OG meta tags (auto Twitter card preview) + Download card images + Share on X (Web Intent)
7. Legal disclaimer on all reports: "For educational/research purposes only, not financial or legal advice"
```

### Prediction Market Forensics Mode

```
1. User browses recent resolved Polymarket events (last 30 days, from event-screener)
   - Simple list: event title, outcome, resolution date, "Investigate" button
   - Or pastes a market ID directly
2. Navigation: /investigate/prediction/[eventId] (shareable URL)
3. Loading: SSE-streamed phase transitions (same pattern as token mode)
4. Results: Forensic report with:
   - Top profiters and their timing
   - Wallet connections via related-wallets (no trace — save credits)
   - Cross-reference with on-chain token activity
   - Insider Score (0-100)
   - AI narrative: "Did someone know?"
5. Share: OG cards + download + Web Intent
```

### Autonomous Monitoring Mode

```
1. User opens monitor dashboard
2. Pre-seeded with real Nansen data (2-3 poll cycles run during development, ~300-450 credits)
3. Fake SSE replays historical events on a timer (~one event every 30s for demo effect)
4. Live feed shows auto-detected events:
   - "Smart Money wallet 0xABC bought $500K of TOKEN"
   - "Net flow reversal detected for TOKEN"
   - "Prediction market odds swung 40% in 24h"
5. Each event has "Investigate" button → launches full forensic flow
6. Agent status: "ACTIVE — Last scan: 2 min ago — 3 alerts pending"
7. Counter: "142 events scanned, 7 flagged"
```

**Note: Monitoring is a DEMO FEATURE.** Pre-seeded with real data, fake SSE replays for presentation. Saves all credits for investigations.

---

## 4. Nansen CLI Endpoints (22 Unique)

### Credit System — CRITICAL

**We are on the FREE plan. All credit costs are 10x vs Pro.**

| Plan | Current Balance | Cost Multiplier |
|------|----------------|-----------------|
| Free | **~6,110 credits** (confirmed) | **10x** (1-credit endpoints cost 10, 5-credit endpoints cost 50) |

**CLI Integration: CLI-preferred** (hackathon values CLI usage). Use `child_process.execFile()` with `nansen research` commands. REST API (`https://api.nansen.ai/api/v1`) as fallback with exponential backoff retry. 15-second timeout per individual CLI call.

**Endpoints to AVOID on free plan:**
- `profiler labels` — 1,000 credits (Common) / 5,000 credits (Premium). **NEVER call this.**
- `profiler batch --include labels` — labels cost applies per address. Use `--include balance,pnl-summary` instead.
- `profiler trace` with high depth/width — each hop calls `counterparties` (50 credits each). **Limit to `--depth 2 --width 3` for top suspect, `--depth 1 --width 3` for others.**

### Profiler Domain (9 endpoints)

| # | Endpoint | Command | Pro | **Free (10x)** | Used For |
|---|----------|---------|-----|-----------------|----------|
| 1 | `profiler trace` | `nansen research profiler trace --address X --chain Y --depth D --width 3` | ~5/hop | **~50/hop** | **Multi-hop BFS graph traversal.** Depth 2 for top suspect (~400 cr), depth 1 for others (~200 cr). |
| 2 | `profiler batch` | `nansen research profiler batch --chain Y --include balance,pnl-summary` | ~1/addr | **~10-20/addr** | **Bulk profile suspects.** Do NOT include labels. |
| 3 | `profiler compare` | `nansen research profiler compare --addresses X,Y --chain Z` | ~5 | **~50-100** | **Find shared counterparties** between two suspect wallets. Always use when ≥2 suspects found. |
| 4 | `profiler transactions` | `nansen research profiler transactions --address X --chain Y --days 30` | 1 | **10** | Transaction history around anomaly timestamps. |
| 5 | `profiler counterparties` | `nansen research profiler counterparties --address X --chain Y --days 30` | 5 | **50** | Top trading partners. Who are suspects interacting with? |
| 6 | `profiler related-wallets` | `nansen research profiler related-wallets --address X --chain Y` | 1 | **10** | Connected addresses (funding sources, alt wallets). |
| 7 | `profiler pnl-summary` | `nansen research profiler pnl-summary --address X --chain Y` | 1 | **10** | Win rate, total PnL. Are suspects consistently profitable? |
| 8 | `profiler perp-positions` | `nansen research profiler perp-positions --address X` | 1 | **10** | Were suspects hedged on perps? **Skip for tokens with <$10M market cap.** |
| 9 | `profiler search` | `nansen research profiler search --query "name"` | 0 | **0** | Entity/ENS resolution. Free! |

### Token Domain (5 endpoints)

| # | Endpoint | Command | Pro | **Free (10x)** | Used For |
|---|----------|---------|-----|-----------------|----------|
| 10 | `token flow-intelligence` | `nansen research token flow-intelligence --token X --chain Y --days 30` | 1 | **10** | **Labeled flow analysis.** Which entity types moved tokens and when. |
| 11 | `token who-bought-sold` | `nansen research token who-bought-sold --token X --chain Y` | 1 | **10** | Recent buyers/sellers with Nansen labels. **Label richness needs testing — may reweight scoring factor.** |
| 12 | `token dex-trades` | `nansen research token dex-trades --token X --chain Y --days 30` | 1 | **10** | DEX trading activity around anomaly. Also used for intraday timing precision. |
| 13 | `token ohlcv` | `nansen research token ohlcv --token X --chain Y --timeframe 1d` | 1 | **10** | Price history. Detect anomalies (daily candles identify which day). |
| 14 | `token info` | `nansen research token info --token X --chain Y` | 1 | **10** | Token metadata (name, symbol, market cap). Used for dynamic anomaly threshold. |

### Smart Money Domain (2 endpoints)

| # | Endpoint | Command | Pro | **Free (10x)** | Used For |
|---|----------|---------|-----|-----------------|----------|
| 15 | `smart-money dex-trades` | `nansen research smart-money dex-trades --chain Y` | 5 | **50** | Real-time smart money DEX activity. What are they buying/selling NOW? |
| 16 | `smart-money netflow` | `nansen research smart-money netflow --chain Y` | 5 | **50** | Net capital flow direction. Detect flow reversals. |

### Prediction Market Domain (6 endpoints)

Credit costs **not documented** in Nansen API docs — these endpoints are newer. Estimated costs based on similar endpoint tiers. Need to verify empirically.

| # | Endpoint | Command | Pro (est.) | **Free (est.)** | Used For |
|---|----------|---------|------------|------------------|----------|
| 17 | `prediction-market pnl-by-market` | `nansen research prediction-market pnl-by-market --market-id X` | ~1-5 | **~10-50** | Who profited from a specific event? Ranked. |
| 18 | `prediction-market pnl-by-address` | `nansen research prediction-market pnl-by-address --address X` | ~1-5 | **~10-50** | Full PnL history for a Polymarket trader. |
| 19 | `prediction-market trades-by-address` | `nansen research prediction-market trades-by-address --address X` | ~1-5 | **~10-50** | When did they place bets? Timing analysis. |
| 20 | `prediction-market top-holders` | `nansen research prediction-market top-holders --market-id X` | ~1-5 | **~10-50** | Largest position holders in a market. |
| 21 | `prediction-market market-screener` | `nansen research prediction-market market-screener` | ~1-5 | **~10-50** | Discover interesting/active markets. |
| 22 | `prediction-market event-screener` | `nansen research prediction-market event-screener` | ~1-5 | **~10-50** | Browse events (resolved, active, etc.). |

**Total: 22 unique endpoints** across 4 domains. Well above the 10+ minimum. Heavily features underused endpoints (`profiler trace`, `batch`, `compare`, all prediction-market endpoints).

### Credit Cost Verification Plan

Before building, we should run 1 call of each key endpoint and check `nansen account` before/after to measure actual free-plan costs for:
- `profiler trace --depth 1 --width 3` (composite, unknown cost)
- `profiler compare` (composite, unknown cost)
- `profiler batch --include balance` (unknown per-address cost)
- Any `prediction-market` endpoint (undocumented costs)

---

## 5. Investigation Data Flows

### Pre-filter: CoinGecko Volatility Check (0 Nansen credits)

Before spending Nansen credits, use the **CoinGecko free API** to check recent price volatility:
- `GET /api/v3/simple/token_price/{platform_id}?vs_currencies=usd&include_24hr_change=true`
- If no significant recent movement detected, warn the user ("This token hasn't had notable price action recently — investigate anyway?")
- This saves ~30 credits per dead-end investigation on stablecoins and low-volatility tokens

### Token Forensics — 4-Phase Investigation

**Estimated 12-15 API calls per investigation. ~400-600 credits on free plan (higher for top suspect depth 2 trace).**

```
Phase 0: RECON (3 parallel calls, ~30 free credits)
├── token info              → 10 cr → Token metadata + MARKET CAP (for dynamic threshold)
├── token ohlcv (90 days)   → 10 cr → Price history → DETECT ANOMALIES
└── token who-bought-sold   → 10 cr → Recent buyers/sellers + Nansen labels

    ANOMALY DETECTION — Dynamic threshold by market cap:
    - >$100M market cap: 20% move in 24h
    - $1M-$100M: 50% move in 24h
    - <$1M: 100% move in 24h
    If no anomaly detected → EARLY EXIT → return "CLEAN" report (saves ~370+ credits).

Phase 1: SUSPECT IDENTIFICATION (4 parallel calls, ~120 free credits)
├── token flow-intelligence → 10 cr → Labeled entity flows around anomaly
├── token dex-trades        → 10 cr → DEX activity around anomaly (+ intraday timing)
├── smart-money dex-trades  → 50 cr → Smart money activity on this chain
└── smart-money netflow     → 50 cr → Capital flow direction

    SUSPECT RANKING — Weighted union approach:
    1. Merge addresses from who-bought-sold, dex-trades, and flow-intelligence
    2. For each: compute timingAdvantage × volume score
    3. DEX-visible addresses weighted 1.5x (traceable in Phase 2)
    4. CEX-only addresses flagged but deprioritized
    5. Select top 3 suspects

    TIMING PRECISION: Use dex-trades timestamps to pinpoint intraday timing
    (daily OHLCV identifies which day, dex-trades pinpoints the hour)

Phase 2: DEEP PROFILING (5-9 calls, ~250-450 free credits)
├── profiler trace (#1, DEPTH 2, width 3) → ~400 cr → Deep wallet graph for top suspect
├── profiler related-wallets (#1)         → 10 cr  → Connected addresses
├── profiler pnl-summary (#1)             → 10 cr  → Track record
├── profiler pnl-summary (#2)             → 10 cr  → Track record
├── profiler pnl-summary (#3)             → 10 cr  → Track record
├── [CONDITIONAL] profiler perp-positions (#1) → 10 cr → Only if market cap >$10M
├── [ALWAYS if ≥2 suspects] profiler compare (#1,#2) → ~100 cr → Shared counterparties
└── [OPTIONAL] Suspects #2/#3: related-wallets only (10 cr each, skip trace)

    SUSPECT GROUPING — Adaptive presentation:
    - If suspects are connected (same funding source, shared counterparties):
      cluster them as one finding ("2 wallets trace to same source")
    - If unrelated: list individually

    ERROR HANDLING: Retry once (2s delay) on failure, then graceful degradation
    (mark section as "Data unavailable", reduce confidence in suspicion score)

    NOTE: Skip profiler batch (labels too expensive).
    NOTE: Skip standalone counterparties (trace already calls it).
    Build: Wallet connection graph from trace + related-wallets + compare.

Phase 3: ANALYSIS + REPORT (no Nansen calls, 0 credits)
├── Compute Suspicion Score (0-100) — see Section 6
├── Build forensic timeline — see Section 5a
├── Build wallet connection graph (d3-force format)
├── Generate AI narrative (Gemini, score-aware) — see Section 8
└── Save to SQLite + async render shareable cards (Playwright)
```

**With ~6,110 credits: ~8-12 token investigations possible (depth 2 for top suspect). Cache aggressively.**

### Timeline Precision Strategy

- **Daily OHLCV** identifies which day the anomaly occurred
- **DEX-trades timestamps** pinpoint the exact hour within that day
- No extra API cost — dex-trades is already called in Phase 1
- Timeline events use relative timestamps: T-6h, T-4h, T-0 (price move), T+1h

### Prediction Market Forensics — 3-Phase Investigation

**Estimated 8-12 API calls per investigation. ~200-400 free credits (costs TBD — PM endpoints undocumented).**

**Build regardless of endpoint cost** — PM forensics is a unique differentiator no other tool offers.

```
Phase 0: EVENT DISCOVERY (2 calls, ~20-100 free credits est.)
├── prediction-market event-screener  → Browse recently resolved events (last 30 days)
└── prediction-market market-screener → Find markets

    Simple list UI: event title, outcome, resolution date, "Investigate" button.
    User selects a resolved event (or pastes market ID directly).

Phase 1: PROFIT ANALYSIS (2 calls, ~20-100 free credits est.)
├── prediction-market pnl-by-market   → Ranked profiters
└── prediction-market top-holders     → Position holders

    Extract: Top 3 most profitable addresses.

Phase 2: WALLET TRACING (per top profiter, 3-4 calls × 2 profiters, ~120-200 free credits)
├── prediction-market trades-by-address  → 10-50 cr → Trade timing
├── profiler pnl-summary                 → 10 cr   → Overall track record
├── profiler transactions                → 10 cr   → On-chain activity
└── profiler related-wallets             → 10 cr   → Connected wallets

    NOTE: Skip profiler trace in PM mode to save credits.
    Use related-wallets instead (cheaper, still shows connections).
    Analyze: Did they buy before resolution? How early?

Phase 3: ANALYSIS + REPORT (no Nansen calls, 0 credits)
├── Compute Insider Score (0-100) — adapted scoring for PM context
├── Build timeline: position entry vs odds movement vs event resolution
├── Generate AI narrative: "Did someone know?"
└── Save + render shareable cards
```

---

## 6. Suspicion Score Algorithm

**Multi-factor weighted score (0-100). Transparent and explainable.**

Each factor appears as an "evidence item" in the report with its own sub-score.

| Factor | Weight | What It Measures | Scoring |
|--------|--------|-----------------|---------|
| **Timing** | 30% | How early before the price move did suspects trade? | >24h early = 100, 6-24h = 80, 1-6h = 60, <1h = 40 |
| **Volume Concentration** | 20% | What % of pre-move volume came from top 3 wallets? | >50% = 100, 30-50% = 70, 10-30% = 40, <10% = 20 |
| **Wallet Connections** | 20% | Are suspects connected via trace/compare/related? | Same funding source = 100, shared counterparties = 70, related wallets = 50, none = 0 |
| **Smart Money Labels** | 15% | Are suspects labeled (fund, smart trader, known entity)? | Known fund = 100, smart trader = 70, labeled = 50, unlabeled = 20 |
| **Profit Magnitude** | 15% | How much did suspects profit vs their historical avg? | >10x avg = 100, 5-10x = 70, 2-5x = 40, <2x = 20 |

**Note on Smart Money Labels weight (15%):** This relies on `who-bought-sold` returning Nansen entity labels. If testing reveals labels are sparse from this endpoint, redistribute the 15% to Timing (→35%) and Wallet Connections (→25%).

### Verdict Labels

| Score Range | Verdict | Color |
|-------------|---------|-------|
| 80-100 | HIGHLY SUSPICIOUS | Red `#FF4444` |
| 60-79 | SUSPICIOUS | Orange `#FF8800` |
| 40-59 | NOTABLE | Amber `#FFB800` |
| 20-39 | INCONCLUSIVE | Gray `#888888` |
| 0-19 | CLEAN | Green `#00FF88` |

---

## 7. Autonomous Monitoring

### Implementation Strategy: Pre-seeded + Fake SSE

**For the hackathon, monitoring is a demo feature optimized for visual impact, not live operation.**

1. **During development:** Run 2-3 real poll cycles (~300-450 credits) to collect authentic data
2. **For demo:** Pre-seed SQLite with the real collected data
3. **Fake SSE:** Replay historical events on a timer (~one event every 30 seconds) to simulate live monitoring
4. **Net effect:** Looks like the agent has been running autonomously. Zero credits spent during demo.

### Real Polling (for seeding data)

**Polling cycle** (every `MONITOR_INTERVAL_MS`, default **15 minutes** to conserve credits):

1. Call `smart-money dex-trades` → 50 credits → detect large SM trades
2. Call `smart-money netflow` → 50 credits → detect flow reversals
3. Call `prediction-market market-screener` → ~10-50 credits → detect unusual PM volume

**Cost per poll: ~110-150 credits.**

### Trigger Conditions (what counts as "notable")

| Trigger | Condition |
|---------|-----------|
| Large SM trade | Smart money makes >$100K single DEX trade |
| Flow reversal | Net flow direction changes for a top-100 token |
| PM odds swing | Prediction market odds move >30% in 24h |
| SM accumulation | New smart money position in a token with >20% price move |

**When triggered:**
1. Store finding in SQLite `monitor_events` table
2. Push to frontend via SSE (real) or fake SSE (demo replay)
3. Each event card has "Investigate" button → launches full forensic flow

### Making It Feel Autonomous

- Landing page shows: `Agent Status: ACTIVE — Last scan: 2 min ago — 3 alerts pending`
- Monitor dashboard has real-time feed that updates without user action (fake SSE replay)
- Events accumulate in SQLite
- Counter: "142 events scanned, 7 flagged"

---

## 8. AI Narrative System

### Model

Configurable via `GEMINI_MODEL` env var. Default: `gemini-2.5-flash`. Fallback: `gemini-2.5-flash-lite`.

Uses `@google/genai` SDK with structured JSON output mode (`responseMimeType: 'application/json'` + `responseSchema`).

### Score-Aware Narrative Generation

The AI receives the computed suspicion score and verdict label as context to calibrate tone:
- 80-100: Dramatic, urgent, specific data points
- 40-79: Measured, analytical, notes patterns
- 0-39: Dismissive or neutral, acknowledges lack of evidence

### System Prompt

```
You are The Snitch, an AI forensic intelligence agent that analyzes on-chain data
to detect suspicious trading activity. You write case narratives like a seasoned
financial crimes investigator.

## CONTEXT
You will receive the suspicion score (0-100) and verdict label. Calibrate your tone:
- HIGH scores (80+): Build tension. Emphasize specific timing, amounts, connections.
- MEDIUM scores (40-79): Analytical. Note patterns but acknowledge uncertainty.
- LOW scores (0-39): Brief. Note the investigation found limited evidence.

## TONE
- Professional but sharp. Think FBI financial crimes report meets crypto Twitter.
- Use specific data: addresses (truncated), amounts, timestamps, percentages.
- Build narrative tension: "At T-6 hours... then at T-4 hours... and when the pump hit..."
- Never accuse directly. Use phrases like "highly correlated," "notable timing,"
  "warrants further investigation."
- End with a memorable one-liner that works as a tweet.

## DO NOT
- Use generic filler ("In the world of crypto...")
- Make moral judgments
- Claim certainty about intent
```

### Structured Output Schema

```json
{
  "caseNarrative": "3-5 paragraphs telling the story",
  "keyFindings": ["Finding 1 (<100 chars)", "Finding 2", "Finding 3"],
  "shareableLine": "Under 120 chars, works as a tweet",
  "verdictLabel": "HIGHLY SUSPICIOUS | SUSPICIOUS | NOTABLE | INCONCLUSIVE | CLEAN"
}
```

### Error Handling

1. **Primary model** with strict JSON schema → parse response
2. **If malformed:** Retry once with more explicit prompt
3. **If still failing:** Try fallback model (`gemini-2.5-flash-lite`)
4. **If all AI fails:** Generate programmatic narrative from evidence items (template-based)

---

## 9. Shareable Report Cards

### Design Language: "Classified Intelligence Brief"

| Element | Value |
|---------|-------|
| Primary accent | Forensic green `#00FF88` |
| Warning accent | Amber `#FFB800` |
| Danger accent | Red `#FF4444` |
| Background | Near-black `#0A0A0A` |
| Font (headings) | Syne (bold, all-caps) — self-hosted .woff2 |
| Font (data) | JetBrains Mono (monospace) — self-hosted .woff2 |
| Card size | 1200×630px (Twitter optimized) |
| Overlay | Green-tinted grain texture |

**Fonts are self-hosted** in `/public/fonts/` (Syne + JetBrains Mono .woff2 files) to guarantee availability for Playwright rendering.

### Rendering: Playwright

Cards are rendered via Playwright (headless Chromium) in a VPS/Docker environment:
- Singleton browser instance (lazy-loaded)
- Navigate to internal card-render route: `http://localhost:3000/card-render/${caseId}?variant=${variant}`
- Wait for d3-force simulation to settle (if graph present): `waitForSelector('.graph-ready')`
- Screenshot at 1200×630 viewport → PNG
- Render in background (async, non-blocking — return report JSON immediately)
- Save to `public/images/${caseId}_${variant}.png`

### Sharing Strategy: OG Meta Tags + Download + Web Intent

1. **OG Meta Tags**: Each investigation page has `og:image` pointing to the rendered card. Sharing the URL on Twitter/X auto-shows the card preview. `twitter:card = summary_large_image`.
2. **Download Button**: High-res PNG download for manual sharing (Discord, Telegram, etc.)
3. **X Web Intent**: Pre-filled tweet text via `https://twitter.com/intent/tweet?text=...&url=...&hashtags=NansenCLI`

### Card 1: Forensic Report Card (Primary Shareable)

```
+------------------------------------------------------------------+
|  [CLASSIFIED] stripe (color based on verdict)                     |
|                                                                   |
|  THE SNITCH               CASE #2026-0342     thesnitch.xyz      |
|  ─────────────────────────────────────────────────────────        |
|                                                                   |
|  TOKEN: $PEPE                            CHAIN: ETHEREUM          |
|                                                                   |
|  SUSPICION SCORE                                                  |
|  [██████████████████░░░░░░░░░░] 78/100    ← HIGHLY SUSPICIOUS    |
|                                                                   |
|  KEY FINDINGS:                                                    |
|  ■ 3 wallets bought $2.4M worth 6 hours before 40% pump          |
|  ■ All 3 wallets trace back to same funding source                |
|  ■ Smart Money label: "Jump Trading" — connected wallet           |
|                                                                   |
|  ─────────────────────────────────────────────────────────        |
|  thesnitch.xyz            Powered by Nansen         #NansenCLI   |
+------------------------------------------------------------------+
```

### Card 2: Forensic Timeline (Secondary Shareable)

```
+------------------------------------------------------------------+
|  THE SNITCH — FORENSIC TIMELINE         CASE #2026-0342          |
|  ─────────────────────────────────────────────────────────        |
|                                                                   |
|  TOKEN: $PEPE — 40% pump on Mar 21, 2026                         |
|                                                                   |
|  T-6h  ● 0xA3f...  bought $800K                  [SUSPECT]       |
|  T-5h  ● 0x7Bc...  bought $600K                  [SUSPECT]       |
|  T-4h  ● 0xD1e...  bought $1.0M                  [SUSPECT]       |
|  T-2h  ● Smart Money netflow turns positive                      |
|  T-0   ● ██████ PRICE PUMP: +40% ██████                          |
|  T+1h  ● 0xA3f...  sold $1.2M (+50%)             [SUSPECT]       |
|  T+3h  ● 0x7Bc...  sold $900K (+50%)             [SUSPECT]       |
|                                                                   |
|  3 wallets connected via profiler trace (depth 2)                 |
|  ─────────────────────────────────────────────────────────        |
|  thesnitch.xyz            Powered by Nansen         #NansenCLI   |
+------------------------------------------------------------------+
```

### Card 3: Prediction Market Report

```
+------------------------------------------------------------------+
|  [CLASSIFIED] stripe                                              |
|                                                                   |
|  THE SNITCH — PREDICTION MARKET FORENSICS                        |
|  ─────────────────────────────────────────────────────────        |
|                                                                   |
|  EVENT: "Will BTC hit $200K by June 2026?"                        |
|  OUTCOME: YES (resolved Mar 15)                                   |
|                                                                   |
|  INSIDER SCORE: [████████████████████░░] 85/100                   |
|                                                                   |
|  TOP PROFITER: 0xA3f...                                           |
|  ■ Bought YES at $0.12 — 3 weeks before resolution               |
|  ■ PnL: +$340K on this event alone                               |
|  ■ 2 related wallets also held YES positions                      |
|  ■ On-chain: received large transfer from labeled exchange        |
|                                                                   |
|  ─────────────────────────────────────────────────────────        |
|  thesnitch.xyz            Powered by Nansen         #NansenCLI   |
+------------------------------------------------------------------+
```

---

## 10. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 15 (App Router) | SSR + API routes + Server Components |
| Language | TypeScript 5.x | Strict mode |
| Styling | Tailwind CSS v4 | Dark forensic theme, fully responsive |
| Data Source | Nansen CLI (preferred) + REST API fallback | CLI via child_process.execFile, 15s timeout |
| Pre-filter | CoinGecko free API | Volatility check + token name search |
| AI | Gemini (configurable via `GEMINI_MODEL` env var, default 2.5 Flash) | Structured JSON output, score-aware |
| Image Gen | Playwright (HTML → PNG) | 1200×630 cards, VPS/Docker deployment |
| Caching | SQLite via `better-sqlite3` | Flat 24h TTL, WAL mode |
| Graph Viz | d3-force | Interactive in browser + Playwright screenshots for cards |
| Rate Limiting | 5 investigations/day/IP (SQLite-backed) | Viewing cached reports unlimited |
| Budget Tracking | Daily credit tracking (SQLite) | `DAILY_BUDGET_CAP`, graceful degradation when exhausted |
| Package Manager | pnpm | Per project conventions |
| Fonts | Syne + JetBrains Mono | Self-hosted .woff2 in /public/fonts |

### Key Dependencies

```
nansen-cli@latest          # Nansen CLI
better-sqlite3             # Embedded SQLite
@google/genai              # Gemini API
playwright-core            # Headless Chrome
d3-force                   # Graph visualization
```

---

## 11. Architecture / Directory Structure

```
nansen-ai2/
├── app/
│   ├── layout.tsx                          # Root layout (fonts, dark theme, disclaimer)
│   ├── globals.css                         # Forensic green/amber theme tokens
│   ├── page.tsx                            # Landing: mode selector + recent investigations
│   ├── investigate/
│   │   ├── token/[address]/
│   │   │   ├── page.tsx                    # Token forensics SSR entry
│   │   │   └── investigation-view.tsx      # Client: SSE-streamed investigation UI
│   │   └── prediction/
│   │       ├── page.tsx                    # PM event browser (recent resolved)
│   │       └── [eventId]/
│   │           ├── page.tsx                # PM forensics SSR entry
│   │           └── investigation-view.tsx  # Client: PM investigation UI
│   ├── monitor/
│   │   └── page.tsx                        # Autonomous monitoring dashboard
│   ├── card-render/[caseId]/
│   │   ├── page.tsx                        # Playwright screenshot target
│   │   ├── forensic-card.tsx               # Report card component (1200×630)
│   │   └── timeline-card.tsx               # Timeline card component (1200×630)
│   └── api/
│       ├── investigate/
│       │   ├── token/[address]/route.ts    # Token forensics orchestration (SSE)
│       │   └── prediction/[eventId]/route.ts # PM forensics orchestration (SSE)
│       ├── monitor/
│       │   ├── poll/route.ts               # Trigger one watcher cycle
│       │   └── events/route.ts             # SSE stream (real + fake replay)
│       ├── investigations/
│       │   └── recent/route.ts             # Recent public investigations feed
│       ├── search/
│       │   └── token/route.ts              # CoinGecko token search proxy
│       └── og/[caseId]/route.ts            # OG image serving
├── components/
│   ├── ModeSelector.tsx                    # Token vs Prediction Market vs Monitor tabs
│   ├── TokenInput.tsx                      # Token address/name input + CoinGecko autocomplete + chain dropdown
│   ├── PredictionInput.tsx                 # Event ID / browse input
│   ├── InvestigationLoading.tsx            # Staged progress with real phase transitions
│   ├── ForensicTimeline.tsx                # Visual event timeline (T-Xh markers)
│   ├── WalletGraph.tsx                     # d3-force interactive graph (zoom, pan, drag, tooltips)
│   ├── SuspicionMeter.tsx                  # Animated 0-100 gauge with verdict
│   ├── EvidenceCard.tsx                    # Individual evidence item with sub-score
│   ├── CaseNarrative.tsx                   # AI-generated detective narrative
│   ├── ForensicReportCard.tsx              # Report card (CSS version for in-page display)
│   ├── ShareButtons.tsx                    # X Web Intent + Download + Copy link
│   ├── MonitorDashboard.tsx                # Live monitoring feed with fake SSE
│   ├── MonitorEventCard.tsx                # Individual monitor event card
│   └── RecentInvestigations.tsx            # Homepage public feed
├── lib/
│   ├── nansen/
│   │   ├── client.ts                       # CLI exec + REST fallback + caching (15s timeout)
│   │   ├── types.ts                        # All Nansen response types
│   │   └── endpoints/
│   │       ├── profiler.ts                 # 9 profiler endpoints
│   │       ├── token.ts                    # 5 token endpoints
│   │       ├── smart-money.ts              # 2 smart-money endpoints
│   │       └── prediction.ts               # 6 prediction-market endpoints
│   ├── forensics/
│   │   ├── types.ts                        # ForensicReport, Suspect, Timeline, etc.
│   │   ├── token-investigator.ts           # 4-phase token forensic orchestration
│   │   ├── prediction-investigator.ts      # 3-phase PM forensic orchestration
│   │   ├── suspicion-scorer.ts             # Multi-factor scoring algorithm
│   │   ├── timeline-builder.ts             # Build forensic timeline from data
│   │   ├── graph-builder.ts                # Build wallet graph from trace data
│   │   └── narrative-generator.ts          # Gemini AI case narrative (score-aware)
│   ├── external/
│   │   └── coingecko.ts                    # Free API: token search + volatility pre-filter
│   ├── monitor/
│   │   ├── watcher.ts                      # Background polling logic
│   │   └── triggers.ts                     # Notable event definitions
│   ├── cache/
│   │   ├── db.ts                           # SQLite schema + connection (WAL mode)
│   │   └── queries.ts                      # Cache CRUD operations
│   ├── image/
│   │   ├── renderer.ts                     # Playwright card renderer (singleton)
│   │   └── storage.ts                      # PNG disk storage
│   ├── budget/
│   │   └── tracker.ts                      # Daily credit budget + graceful degradation
│   ├── rate-limit/
│   │   └── limiter.ts                      # 5/day/IP rate limiting (SQLite-backed)
│   └── utils/
│       ├── address.ts                      # Address validation (ETH + SOL)
│       ├── chain-detect.ts                 # EVM/Solana auto-detection + free RPC probe
│       └── format.ts                       # Number/date formatting
├── data/
│   └── cache.db                            # SQLite (auto-created)
├── public/
│   ├── fonts/                              # Syne, JetBrains Mono (.woff2)
│   └── images/                             # Generated card PNGs
├── .env.example
├── package.json
├── tsconfig.json
├── next.config.ts
├── Dockerfile
├── docker-compose.yml
└── nginx.conf
```

---

## 12. Database Schema

```sql
-- Nansen API response cache (reused from Cookd)
CREATE TABLE IF NOT EXISTS api_cache (
  cache_key TEXT PRIMARY KEY,
  response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  ttl_seconds INTEGER NOT NULL DEFAULT 86400
);

-- Completed investigations (public, accessible by anyone with case ID)
CREATE TABLE IF NOT EXISTS investigations (
  id TEXT PRIMARY KEY,                    -- case-YYYYMMDD-XXXX (random 4 hex chars)
  mode TEXT NOT NULL,                     -- 'token' | 'prediction'
  subject_id TEXT NOT NULL,               -- token address or event ID
  chain TEXT,
  suspicion_score INTEGER,
  verdict TEXT,
  report_json TEXT NOT NULL,
  card_path TEXT,
  timeline_card_path TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  ttl_seconds INTEGER NOT NULL DEFAULT 86400
);

-- Auto-detected monitor events
CREATE TABLE IF NOT EXISTS monitor_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,               -- 'sm_trade' | 'flow_reversal' | 'pm_swing'
  subject_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  data_json TEXT NOT NULL,
  investigated INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Rate limiting (5 investigations/day per IP)
CREATE TABLE IF NOT EXISTS rate_limits (
  ip TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

-- Budget tracking
CREATE TABLE IF NOT EXISTS budget_tracking (
  date TEXT NOT NULL,
  credits_used REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date)
);

CREATE INDEX IF NOT EXISTS idx_monitor_created ON monitor_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_investigations_subject ON investigations(subject_id, mode);
CREATE INDEX IF NOT EXISTS idx_api_cache_ttl ON api_cache(created_at);
```

---

## 13. Reuse from Cookd

Cookd is at `../nansen-ai` (deployed separately). Building The Snitch as a new project, adapting Cookd patterns.

### Copy and Adapt (minimal changes)

| Cookd File | Snitch Target | Changes |
|------------|---------------|---------|
| `lib/nansen/client.ts` | `lib/nansen/client.ts` | Same CLI exec + REST fallback pattern. Adjust timeout to 15s. |
| `lib/cache/db.ts` | `lib/cache/db.ts` | New schema (investigations, monitor_events). Same WAL mode + busy timeout. |
| `lib/cache/queries.ts` | `lib/cache/queries.ts` | New query functions for investigations + monitor events. |
| `lib/image/renderer.ts` | `lib/image/renderer.ts` | Change card URL paths. Add d3-force settle wait. |
| `lib/image/storage.ts` | `lib/image/storage.ts` | Change path pattern to `${caseId}_${variant}.png`. |
| `lib/budget/tracker.ts` | `lib/budget/tracker.ts` | Adjust credit costs. Remove roast-specific logic. Add graceful degradation. |
| `lib/rate-limit/limiter.ts` | `lib/rate-limit/limiter.ts` | Change to 5/day only (remove hourly). |
| `lib/utils/address.ts` | `lib/utils/address.ts` | Same (ETH + SOL regex, truncate). |
| `lib/utils/chain-detect.ts` | `lib/utils/chain-detect.ts` | Same (free RPC probe for EVM). |
| `components/ShareButtons.tsx` | `components/ShareButtons.tsx` | Change tweet text. Add OG URL sharing. |
| `next.config.ts` | `next.config.ts` | Same standalone + externals pattern. |

### Build New

Everything in `lib/forensics/`, `lib/monitor/`, `lib/external/`, `lib/nansen/endpoints/`, all investigation views, all forensic components, all card designs.

---

## 14. Environment Variables

```bash
# Required
NANSEN_API_KEY=              # Nansen API key (for both CLI and REST fallback)
GEMINI_API_KEY=              # Gemini API key

# Optional
GEMINI_MODEL=gemini-2.5-flash  # Configurable AI model (default: gemini-2.5-flash)
DAILY_CREDIT_CAP=2000        # Daily credit budget (we have ~6,110 total on free plan)
SITE_URL=https://thesnitch.xyz  # Or IP:port for initial deployment
MONITOR_INTERVAL_MS=900000   # 15 min between monitor polls (conserve credits)
NODE_ENV=production
```

---

## 15. Implementation Phases

**Full scope** — no deadline constraint. All phases will be built.

| Phase | What | Time | Status |
|-------|------|------|--------|
| 1. Foundation | Next.js app, Nansen client (CLI+REST), caching, all 22 endpoint wrappers, utils | ~3h | Full |
| 2. Token Forensics | 4-phase investigation, CoinGecko pre-filter, suspicion scorer, timeline builder, graph builder | ~4h | Full |
| 3. AI Narrative | Gemini integration, score-aware narratives, structured output, fallback chain | ~2h | Full |
| 4. Frontend | Investigation views (SSE streaming), all visual components, loading states, responsive | ~4h | Full |
| 5. Shareable Cards | Playwright card rendering, OG meta tags, share buttons, download | ~3h | Full |
| 6. Prediction Market | PM forensics flow, event browser (recent resolved), PM-specific components | ~3h | Full |
| 7. Monitoring | Pre-seeded watcher, fake SSE replay, monitor dashboard | ~3h | Full |
| 8. Polish + Deploy | Research demo tokens, pre-generate showcase cases, Docker, deploy to VPS, X thread | ~3h | Full |

**Total: ~25h across 8 phases.**

---

## 16. X Thread Strategy

### Thread Structure (6 tweets)

**Tweet 1 (Hook + Report Card Image)**:
> I built The Snitch — an autonomous on-chain forensic agent powered by @nansen_ai
>
> It traces wallet connections, detects suspicious trading, and auto-generates intelligence reports.
>
> Here's what it found on $TOKEN:
>
> [Attach: forensic report card]
>
> #NansenCLI

**Tweet 2 (Timeline Card)**:
> 6 hours before a 40% pump, 3 wallets quietly bought $2.4M.
>
> The Snitch traced them using Nansen's profiler trace — multi-hop BFS graph traversal. All 3 connect to the same funding source.
>
> Suspicion score: 78/100
>
> [Attach: timeline card]

**Tweet 3 (Tech Flex — Endpoint Count)**:
> Under the hood: 22 unique Nansen CLI endpoints across 4 domains
>
> • profiler trace / batch / compare (wallet graphs)
> • token flow-intelligence (labeled flows)
> • smart-money dex-trades + netflow
> • prediction-market forensics
> • + Gemini AI for case narratives

**Tweet 4 (Prediction Market Mode)**:
> It also investigates Polymarket.
>
> Who profited most from resolved events? Did they know the outcome beforehand?
>
> The Snitch traces their wallets, checks timing, and scores it.
>
> [Attach: PM report card]

**Tweet 5 (Autonomous Mode)**:
> The autonomous monitor watches 24/7:
> • Smart money making large trades
> • Net flow reversals
> • Prediction market odds swings
>
> Auto-generates forensic reports. Like having a Nansen analyst on staff.

**Tweet 6 (CTA)**:
> Try it: [URL]
>
> The Snitch sees everything.

### Key Tactics

- Lead with visual (report card in tweet 1)
- Show REAL findings on real tokens, not hypotheticals
- Emphasize autonomy (what judges liked in winners)
- Call out endpoint count (22 unique)
- Pre-generate 3-4 investigations on notable recent events for the demo
- Demo tokens need to be researched — find recent notable pumps/dumps/rugs with genuine suspicious patterns

---

## 17. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `profiler trace` is slow or expensive | High | Medium | Depth 2 only for top suspect. Cache aggressively. Fallback to `related-wallets` + `counterparties`. |
| API credits exhausted during dev | High | High | Cache everything (24h TTL). Budget tracking. Graceful degradation (cached reports stay accessible). |
| Some endpoints return empty for test tokens | Medium | Medium | Research 3-4 tokens with known price movements. Cache known-good results for demo. |
| PM endpoints need specific market IDs | Medium | Medium | Use screener endpoints to discover IDs first. Build browse flow (recent resolved only). |
| `profiler batch` tricky via CLI | Medium | Low | Fallback to parallel individual calls. REST API fallback. |
| Investigation takes >60s | Medium | High | Parallelize aggressively (Promise.all per phase). SSE streaming shows partial results. 15s timeout per call, 60s overall. |
| Feature creep | High | High | Strict phase ordering. Full scope committed but sequential delivery. |
| `who-bought-sold` labels sparse | Medium | Medium | Test during development. If sparse, redistribute 15% label weight to timing + connections. |
| CoinGecko API rate limits | Low | Low | Cache search results. Free tier allows 10-30 calls/min. Minimal usage. |
| d3-force graph too complex | Medium | Low | Start simple (few nodes), add complexity incrementally. Playwright waits for simulation to settle. |

### MVP Fallback

If any phase becomes blocked: Token forensics only with shareable cards (Phases 1-5 + 8). Still uses 15+ endpoints, still has AI narrative, still differentiated from Cookd. Present PM and monitoring as "roadmap" in the thread.

---

## 18. Credit Budget (FREE PLAN — 10x costs)

### Current Balance: ~6,110 credits (confirmed)

### Token Forensics (~400-600 credits per investigation)

| Phase | Calls | Free Credits |
|-------|-------|-------------|
| Phase 0: Recon | 3 | ~30 |
| Phase 1: Suspect ID | 4 | ~120 |
| Phase 2: Deep Profile (depth 2 top suspect) | 5-9 | ~250-450 |
| Phase 2 (conditional): compare | 0-1 | 0-100 |
| **Total** | **12-17** | **~400-600** |

**Budget: ~8-12 token investigations with current balance (depth 2 for top suspect).**

### Prediction Market (~200-400 credits per investigation, costs TBD)

| Phase | Calls | Free Credits (est.) |
|-------|-------|-------------------|
| Phase 0: Discovery | 2 | ~20-100 |
| Phase 1: Profit Analysis | 2 | ~20-100 |
| Phase 2: Wallet Tracing (2 profiters) | 6-8 | ~100-200 |
| **Total** | **10-12** | **~200-400** |

### Monitor Seeding (~300-450 credits for 2-3 cycles)

| Call | Free Credits |
|------|-------------|
| smart-money dex-trades | 50 |
| smart-money netflow | 50 |
| prediction-market market-screener | ~10-50 |
| **Total per cycle** | **~110-150** |
| **2-3 seed cycles** | **~300-450** |

### Credit Budget Allocation Strategy

| Purpose | Credits Allocated | Investigations |
|---------|------------------|----------------|
| Development & testing | ~1,500 | ~3-4 test runs |
| Pre-generated showcase cases | ~1,800 | 3 polished demos |
| Live demo buffer | ~1,500 | 3-4 live investigations |
| Monitor seeding | ~450 | 3 poll cycles |
| Reserve | ~860 | Safety buffer |
| **Total** | **~6,110** | |

**This is tight.** Aggressive caching is essential — never re-fetch the same data.

### Cost Optimization Strategies

1. **CoinGecko pre-filter** — Check volatility with free API before spending Nansen credits. Saves ~30 credits per dead-end.
2. **Cache everything** — Flat 24h TTL in SQLite. Same token/address never re-fetched.
3. **Early exit** — Phase 0 detects "no anomaly" → skip Phases 1-2 (saves ~370+ credits).
4. **Dynamic trace depth** — Depth 2 only for top suspect (~400 cr), depth 1 for others (~200 cr).
5. **Skip labels** — Use `search` (free) + `who-bought-sold` labels (10 credits) instead of `profiler labels` (1,000-5,000 credits).
6. **Conditional calls** — `profiler compare` only if ≥2 suspects. `perp-positions` only if market cap >$10M.
7. **PM mode uses cheaper profiler calls** — `related-wallets` (10 cr) instead of `trace` (~200 cr).
8. **Pre-generate showcase cases** — Cache results for 3+ good demos before submission.
9. **Pre-seed monitor** — Run 2-3 real cycles, then fake SSE replay for demo (0 credits during demo).
10. **Graceful degradation** — When credits exhausted, disable new investigations, keep cached reports accessible.

---

## 19. Hackathon Requirements Checklist

| Requirement | Status |
|-------------|--------|
| Install CLI (agents.nansen.ai) | Will install `nansen-cli@latest` |
| Minimum 10 API calls | 22 unique endpoints. Each investigation makes 12-17 calls. |
| Build something creative | Autonomous forensic intelligence agent. No consumer tool does this. |
| Share on X with @nansen_ai + #NansenCLI | 6-tweet thread with visual report cards. |

---

## 20. UX Decisions (from design interview)

### Navigation & URL Structure
- **Navigate immediately** to `/investigate/token/[address]?chain=X` — shareable URL from the start
- SSE streams investigation progress to the client
- Back button works, refresh serves cached results
- Cached investigations show age: "Investigated 3 days ago" + "Re-investigate" button with credit cost warning

### Homepage
- Public feed of ALL users' recent investigations (not session-scoped)
- Agent status bar: "Agent Status: ACTIVE — X events scanned, Y flagged"
- Mode selector: Token Forensics | Prediction Market | Monitor

### Token Search
- CoinGecko free API (`/api/v3/search`) for name search dropdown
- Falls back to address-only input if CoinGecko is unavailable
- No Nansen credits spent on search

### Investigation Access
- **Public by design** — all investigations accessible via case ID URL
- No authentication required
- This is public blockchain data — transparency is the point

### Error Handling
- **Retry once** (2s delay) on individual API call failures
- **Graceful degradation** — if Phase 2 calls fail, generate report with Phase 0+1 data only
- Mark failed sections as "Data unavailable" with reduced confidence in suspicion score
- Overall timeout: 60 seconds (individual call timeout: 15 seconds)

### Rate Limiting & Credits
- **5 investigations per day per IP** (SQLite-backed, survives restarts)
- Viewing cached reports: unlimited
- When credits exhausted: "New investigations temporarily unavailable. Browse existing reports below."

### Responsiveness
- Fully responsive design
- Graph may be simplified or hidden on mobile
- Report cards remain 1200×630 (desktop-optimized for Twitter)

---

## 21. Deployment

### Infrastructure
- **VPS:** `89.167.91.96` (shared with Cookd, accessed via `ssh root@89.167.91.96`)
- **Stack:** Docker Compose — nginx (SSL + static files) + Next.js standalone
- **Coexistence:** nginx routes by domain/subdomain (Cookd has its own domain, Snitch TBD)

### Docker Compose

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

### Dockerfile
- Multi-stage: build → production
- Install Chromium for Playwright
- Install Nansen CLI (`npm i -g nansen-cli`)
- `next.config.ts` output: "standalone"

### nginx
- SSL termination (Let's Encrypt / Cloudflare)
- Proxy pass to Next.js on port 3000
- Serve `/images/` directly from disk (card PNGs)
- Gzip compression
- Route by domain (coexist with Cookd)
