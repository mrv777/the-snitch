import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// --- Test DB setup (mirrors tracker.test.ts pattern) ---

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-token-inv.db");

function cleanTestDb() {
  for (const ext of ["", "-wal", "-shm"]) {
    try {
      fs.unlinkSync(TEST_DB_PATH + ext);
    } catch {
      // ignore
    }
  }
}

function createTestDb(): Database.Database {
  cleanTestDb();
  const db = new Database(TEST_DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_cache (
      cache_key TEXT PRIMARY KEY,
      response_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      ttl_seconds INTEGER NOT NULL DEFAULT 86400
    );
    CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      chain TEXT,
      suspicion_score INTEGER,
      verdict TEXT,
      report_json TEXT NOT NULL,
      card_path TEXT,
      timeline_card_path TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      ttl_seconds INTEGER NOT NULL DEFAULT 86400
    );
    CREATE TABLE IF NOT EXISTS monitor_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      data_json TEXT NOT NULL,
      investigated INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      ip TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget_tracking (
      date TEXT NOT NULL,
      credits_used REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (date)
    );
  `);
  return db;
}

let testDb: Database.Database;

// --- Mock DB ---
vi.mock("@/lib/cache/db", () => ({
  getDb: () => testDb,
}));

// --- Mock Nansen token endpoints ---
vi.mock("@/lib/nansen/endpoints/token", () => ({
  tokenInfo: vi.fn(),
  tokenOhlcv: vi.fn(),
  tokenWhoBoughtSold: vi.fn(),
  tokenFlowIntelligence: vi.fn(),
  tokenDexTrades: vi.fn(),
}));

// --- Mock Nansen profiler endpoints ---
vi.mock("@/lib/nansen/endpoints/profiler", () => ({
  profilerTrace: vi.fn(),
  profilerRelatedWallets: vi.fn(),
  profilerPnlSummary: vi.fn(),
  profilerPerpPositions: vi.fn(),
  profilerCompare: vi.fn(),
}));

// --- Mock Nansen smart-money endpoints ---
vi.mock("@/lib/nansen/endpoints/smart-money", () => ({
  smartMoneyDexTrades: vi.fn(),
  smartMoneyNetflow: vi.fn(),
}));

// --- Mock narrative generator ---
vi.mock("@/lib/forensics/narrative-generator", () => ({
  generateNarrative: vi.fn(),
}));

// --- Mock CoinGecko (threshold = 20% for all tests) ---
vi.mock("@/lib/external/coingecko", () => ({
  getAnomalyThreshold: vi.fn().mockReturnValue(20),
}));

// --- Imports (after mocks are registered) ---

import { investigateToken, computePreMoveVolume } from "@/lib/forensics/token-investigator";
import {
  tokenInfo,
  tokenOhlcv,
  tokenWhoBoughtSold,
  tokenFlowIntelligence,
  tokenDexTrades,
} from "@/lib/nansen/endpoints/token";
import {
  profilerTrace,
  profilerRelatedWallets,
  profilerPnlSummary,
  profilerPerpPositions,
  profilerCompare,
} from "@/lib/nansen/endpoints/profiler";
import {
  smartMoneyDexTrades,
  smartMoneyNetflow,
} from "@/lib/nansen/endpoints/smart-money";
import { generateNarrative } from "@/lib/forensics/narrative-generator";
import type { SSEEvent, ForensicReport, AnomalyWindow, AINarrative } from "@/lib/forensics/types";
import type {
  TokenInfoResponse,
  TokenOhlcvRow,
  WhoBoughtSoldRow,
  FlowIntelligenceRow,
  DexTradeRow,
  SmartMoneyDexTradeRow,
  SmartMoneyNetflowRow,
  TraceResult,
  RelatedWalletRow,
  PnlSummaryResponse,
  PerpPositionRow,
  CompareResult,
  NansenCliResponse,
} from "@/lib/nansen/types";

// --- Constants ---

const TOKEN_ADDRESS = "0xabc123token";
const CHAIN = "ethereum";
const ANOMALY_DATE = "2026-03-21T00:00:00Z";
const ANOMALY_UNIX = Math.floor(Date.parse(ANOMALY_DATE) / 1000);

const SUSPECT_1 = "0xsuspect1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SUSPECT_2 = "0xsuspect2bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

// --- Mock Data Factories ---

function makeTokenInfo(overrides: Partial<TokenInfoResponse> = {}): TokenInfoResponse {
  return {
    token_address: TOKEN_ADDRESS,
    token_symbol: "TEST",
    token_name: "Test Token",
    chain: CHAIN,
    market_cap_usd: 500_000_000,
    price_usd: 1.4,
    holder_count: 10_000,
    volume_24h_usd: 25_000_000,
    ...overrides,
  };
}

function makeOhlcvAnomaly(): TokenOhlcvRow[] {
  return [
    {
      interval_start: "2026-03-20T00:00:00Z",
      open: 1.0,
      high: 1.02,
      low: 0.98,
      close: 1.01,
      volume: 5_000_000,
    },
    {
      interval_start: ANOMALY_DATE,
      open: 1.0,
      high: 1.5,
      low: 0.95,
      close: 1.4,
      volume: 50_000_000,
    },
    {
      interval_start: "2026-03-22T00:00:00Z",
      open: 1.4,
      high: 1.42,
      low: 1.3,
      close: 1.35,
      volume: 10_000_000,
    },
  ];
}

function makeOhlcvClean(): TokenOhlcvRow[] {
  return [
    {
      interval_start: "2026-03-20T00:00:00Z",
      open: 1.0,
      high: 1.03,
      low: 0.97,
      close: 1.02,
      volume: 3_000_000,
    },
    {
      interval_start: ANOMALY_DATE,
      open: 1.0,
      high: 1.08,
      low: 0.96,
      close: 1.05,
      volume: 4_000_000,
    },
  ];
}

function makeWhoBoughtSold(): WhoBoughtSoldRow[] {
  return [
    {
      address: SUSPECT_1,
      address_label: "Shady Fund Capital",
      bought_volume_usd: 500_000,
      sold_volume_usd: 0,
      trade_volume_usd: 500_000,
    },
    {
      address: SUSPECT_2,
      address_label: "Dark Whale",
      bought_volume_usd: 250_000,
      sold_volume_usd: 0,
      trade_volume_usd: 250_000,
    },
  ];
}

function makeDexTrades(): DexTradeRow[] {
  // T-6h and T-4h before anomaly
  const t6h = new Date((ANOMALY_UNIX - 6 * 3600) * 1000).toISOString();
  const t4h = new Date((ANOMALY_UNIX - 4 * 3600) * 1000).toISOString();

  return [
    {
      trader_address: SUSPECT_1,
      trader_address_label: "Shady Fund Capital",
      action: "BUY",
      token_address: TOKEN_ADDRESS,
      token_name: "Test Token",
      token_amount: 300_000,
      traded_token_address: "0xusdc",
      traded_token_name: "USDC",
      traded_token_amount: 300_000,
      estimated_value_usd: 300_000,
      block_timestamp: t6h,
      transaction_hash: "0xtx1hash",
    },
    {
      trader_address: SUSPECT_2,
      trader_address_label: "Dark Whale",
      action: "BUY",
      token_address: TOKEN_ADDRESS,
      token_name: "Test Token",
      token_amount: 150_000,
      traded_token_address: "0xusdc",
      traded_token_name: "USDC",
      traded_token_amount: 150_000,
      estimated_value_usd: 150_000,
      block_timestamp: t4h,
      transaction_hash: "0xtx2hash",
    },
  ];
}

function makeFlowIntelligence(): FlowIntelligenceRow[] {
  return [
    {
      smart_trader_net_flow_usd: 800_000,
      smart_trader_avg_flow_usd: 100_000,
      smart_trader_wallet_count: 8,
      whale_net_flow_usd: 500_000,
      whale_avg_flow_usd: 250_000,
      whale_wallet_count: 2,
    },
  ];
}

function makeSmartMoneyDexTrades(): SmartMoneyDexTradeRow[] {
  return [
    {
      trader_address: "0xsmartmoney1",
      trader_address_label: "Smart Trader Alpha",
      token_bought_address: TOKEN_ADDRESS,
      token_bought_symbol: "TEST",
      token_sold_address: "0xusdc",
      token_sold_symbol: "USDC",
      trade_value_usd: 100_000,
      block_timestamp: new Date((ANOMALY_UNIX - 2 * 3600) * 1000).toISOString(),
      transaction_hash: "0xtx3hash",
      chain: CHAIN,
    },
  ];
}

function makeSmartMoneyNetflow(): SmartMoneyNetflowRow[] {
  return [
    {
      token_address: TOKEN_ADDRESS,
      token_symbol: "TEST",
      chain: CHAIN,
      net_flow_24h_usd: 400_000,
      trader_count: 5,
    },
  ];
}

function makeTraceResult(): TraceResult {
  return {
    root: SUSPECT_1,
    chain: "ethereum",
    depth: 2,
    nodes: [SUSPECT_1, "0xfundingsource111"],
    edges: [
      {
        from: "0xfundingsource111",
        to: SUSPECT_1,
        volume_usd: 1_000_000,
      },
    ],
  };
}

function makeRelatedWallets(): RelatedWalletRow[] {
  return [
    {
      address: SUSPECT_2,
      entity_name: "Dark Whale",
      relationship_type: "common_funding",
    },
    {
      address: "0xrelated999",
      entity_name: "Exchange Deposit",
      relationship_type: "deposit",
    },
  ];
}

function makePnlSummary(addr: string): PnlSummaryResponse {
  return {
    top5_tokens: [
      {
        realized_pnl: 120_000,
        realized_roi: 250,
        token_address: TOKEN_ADDRESS,
        token_symbol: "TEST",
        chain: CHAIN,
      },
    ],
    traded_token_count: 45,
    traded_times: 320,
    realized_pnl_usd: addr === SUSPECT_1 ? 120_000 : 45_000,
    realized_pnl_percent: addr === SUSPECT_1 ? 350 : 180,
    win_rate: addr === SUSPECT_1 ? 0.72 : 0.61,
  };
}

function makePerpPositions(): PerpPositionRow[] {
  return [
    {
      market: "TEST-PERP",
      side: "long",
      size_usd: 500_000,
      entry_price: 1.05,
      mark_price: 1.4,
      unrealized_pnl: 166_000,
      leverage: 5,
    },
  ];
}

function makeCompareResult(): CompareResult {
  return {
    addresses: [SUSPECT_1, SUSPECT_2],
    chain: "ethereum",
    shared_counterparties: ["0xsharedcounterparty1"],
    shared_tokens: ["TEST", "ETH", "USDC"],
  };
}

function makeNarrative(): AINarrative {
  return {
    caseNarrative:
      "The investigation revealed coordinated pre-move buying by two wallets linked to the same funding source.",
    keyFindings: [
      "Two wallets accumulated $750K before 40% pump",
      "Shared funding source traced via on-chain graph",
      "Timing advantage of 6h before price spike",
    ],
    shareableLine:
      "Two connected wallets loaded $750K of $TEST 6h before a 40% pump. Suspicion score: 72/100.",
    verdictLabel: "SUSPICIOUS",
  };
}

// --- Helper: set up all mocks for a full investigation flow ---

function setupFullFlowMocks() {
  const info = makeTokenInfo();
  const ohlcv = makeOhlcvAnomaly();
  const wbs = makeWhoBoughtSold();
  const flow = makeFlowIntelligence();
  const dex = makeDexTrades();
  const smDex = makeSmartMoneyDexTrades();
  const smNet = makeSmartMoneyNetflow();
  const trace = makeTraceResult();
  const related = makeRelatedWallets();
  const compare = makeCompareResult();
  const narrative = makeNarrative();

  // Phase 0
  vi.mocked(tokenInfo).mockResolvedValue({ success: true, data: info });
  vi.mocked(tokenOhlcv).mockResolvedValue({ success: true, data: ohlcv });
  vi.mocked(tokenWhoBoughtSold).mockResolvedValue({ success: true, data: wbs });

  // Phase 1
  vi.mocked(tokenFlowIntelligence).mockResolvedValue({ success: true, data: flow });
  vi.mocked(tokenDexTrades).mockResolvedValue({ success: true, data: dex });
  vi.mocked(smartMoneyDexTrades).mockResolvedValue({ success: true, data: smDex });
  vi.mocked(smartMoneyNetflow).mockResolvedValue({ success: true, data: smNet });

  // Phase 2
  vi.mocked(profilerTrace).mockResolvedValue({ success: true, data: trace });
  vi.mocked(profilerRelatedWallets).mockResolvedValue({ success: true, data: related });
  vi.mocked(profilerPnlSummary).mockImplementation(async (addr: string) => ({
    success: true as const,
    data: makePnlSummary(addr),
  }));
  vi.mocked(profilerPerpPositions).mockResolvedValue({
    success: true,
    data: makePerpPositions(),
  });
  vi.mocked(profilerCompare).mockResolvedValue({ success: true, data: compare });

  // Phase 3
  vi.mocked(generateNarrative).mockResolvedValue(narrative);
}

function setupCleanFlowMocks() {
  const info = makeTokenInfo();
  const ohlcv = makeOhlcvClean();
  const wbs = makeWhoBoughtSold();

  vi.mocked(tokenInfo).mockResolvedValue({ success: true, data: info });
  vi.mocked(tokenOhlcv).mockResolvedValue({ success: true, data: ohlcv });
  vi.mocked(tokenWhoBoughtSold).mockResolvedValue({ success: true, data: wbs });
}

// --- Tests ---

describe("investigateToken", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    // Default: budget is always available
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===== 1. Early exit on clean token =====
  describe("early exit on clean token", () => {
    it("returns CLEAN report with earlyExit=true when no anomaly detected", async () => {
      setupCleanFlowMocks();

      const report = await investigateToken({
        tokenAddress: TOKEN_ADDRESS,
        chain: CHAIN,
      });

      expect(report.verdict).toBe("CLEAN");
      expect(report.suspicionScore).toBe(0);
      expect(report.anomaly).toBeNull();
      expect(report.suspects).toEqual([]);
      expect(report.clusters).toEqual([]);
      expect(report.timeline).toEqual([]);
      expect(report.graph).toEqual({ nodes: [], edges: [] });
      expect(report.narrative).toBeNull();
      expect(report.metadata.earlyExit).toBe(true);
      expect(report.metadata.phasesCompleted).toEqual([0]);
      expect(report.metadata.creditsUsed).toBe(30);
      expect(report.subject.name).toBe("Test Token");
      expect(report.subject.symbol).toBe("TEST");
      expect(report.mode).toBe("token");
    });

    it("saves clean report to DB", async () => {
      setupCleanFlowMocks();

      const report = await investigateToken({
        tokenAddress: TOKEN_ADDRESS,
        chain: CHAIN,
      });

      const row = testDb
        .prepare("SELECT * FROM investigations WHERE id = ?")
        .get(report.caseId) as {
        id: string;
        verdict: string;
        suspicion_score: number;
      };

      expect(row).toBeDefined();
      expect(row.verdict).toBe("CLEAN");
      expect(row.suspicion_score).toBe(0);
    });

    it("does not call phase 1/2/3 endpoints on clean token", async () => {
      setupCleanFlowMocks();

      await investigateToken({ tokenAddress: TOKEN_ADDRESS, chain: CHAIN });

      expect(tokenFlowIntelligence).not.toHaveBeenCalled();
      expect(tokenDexTrades).not.toHaveBeenCalled();
      expect(smartMoneyDexTrades).not.toHaveBeenCalled();
      expect(profilerTrace).not.toHaveBeenCalled();
      expect(profilerPnlSummary).not.toHaveBeenCalled();
      expect(generateNarrative).not.toHaveBeenCalled();
    });
  });

  // ===== 2. Full investigation flow =====
  describe("full investigation flow", () => {
    it("runs all 4 phases and produces a complete report", async () => {
      setupFullFlowMocks();

      const report = await investigateToken({
        tokenAddress: TOKEN_ADDRESS,
        chain: CHAIN,
      });

      // Report structure
      expect(report.caseId).toMatch(/^case-\d{8}-[a-f0-9]{4}$/);
      expect(report.mode).toBe("token");
      expect(report.subject.address).toBe(TOKEN_ADDRESS);
      expect(report.subject.name).toBe("Test Token");
      expect(report.subject.symbol).toBe("TEST");
      expect(report.subject.chain).toBe(CHAIN);
      expect(report.subject.marketCapUsd).toBe(500_000_000);

      // Anomaly detected
      expect(report.anomaly).not.toBeNull();
      expect(report.anomaly!.direction).toBe("pump");
      expect(report.anomaly!.priceChangePct).toBeCloseTo(40, 5);
      expect(report.anomaly!.date).toBe(ANOMALY_DATE);

      // Suspects found
      expect(report.suspects.length).toBeGreaterThanOrEqual(1);

      // Suspicion score and verdict
      expect(report.suspicionScore).toBeGreaterThanOrEqual(0);
      expect(report.suspicionScore).toBeLessThanOrEqual(100);
      expect(["HIGHLY_SUSPICIOUS", "SUSPICIOUS", "NOTABLE", "INCONCLUSIVE", "CLEAN"]).toContain(
        report.verdict
      );

      // Timeline has events
      expect(report.timeline.length).toBeGreaterThan(0);

      // Evidence factors populated
      expect(report.evidence.length).toBeGreaterThan(0);

      // Narrative generated
      expect(report.narrative).not.toBeNull();
      expect(report.narrative!.caseNarrative).toBeTruthy();
      expect(report.narrative!.keyFindings.length).toBe(3);

      // Metadata
      expect(report.metadata.earlyExit).toBe(false);
      expect(report.metadata.phasesCompleted).toEqual([0, 1, 2, 3]);
      expect(report.metadata.creditsUsed).toBeGreaterThan(30); // more than just phase 0
      expect(report.metadata.duration).toBeGreaterThanOrEqual(0);
    });

    it("calls all expected Nansen endpoints", async () => {
      setupFullFlowMocks();

      await investigateToken({ tokenAddress: TOKEN_ADDRESS, chain: CHAIN });

      // Phase 0
      expect(tokenInfo).toHaveBeenCalledWith(TOKEN_ADDRESS, CHAIN);
      expect(tokenOhlcv).toHaveBeenCalledWith(TOKEN_ADDRESS, CHAIN, "1d", 90);
      expect(tokenWhoBoughtSold).toHaveBeenCalledWith(TOKEN_ADDRESS, CHAIN);

      // Phase 1
      expect(tokenFlowIntelligence).toHaveBeenCalledWith(TOKEN_ADDRESS, CHAIN);
      expect(tokenDexTrades).toHaveBeenCalledWith(TOKEN_ADDRESS, CHAIN);
      expect(smartMoneyDexTrades).toHaveBeenCalledWith(CHAIN);
      expect(smartMoneyNetflow).toHaveBeenCalledWith(CHAIN);

      // Phase 2
      expect(profilerTrace).toHaveBeenCalled();
      expect(profilerRelatedWallets).toHaveBeenCalled();
      expect(profilerPnlSummary).toHaveBeenCalled();
      expect(profilerCompare).toHaveBeenCalled();

      // Phase 3
      expect(generateNarrative).toHaveBeenCalled();
    });

    it("saves full report to DB", async () => {
      setupFullFlowMocks();

      const report = await investigateToken({
        tokenAddress: TOKEN_ADDRESS,
        chain: CHAIN,
      });

      const row = testDb
        .prepare("SELECT * FROM investigations WHERE id = ?")
        .get(report.caseId) as {
        id: string;
        verdict: string;
        report_json: string;
        subject_id: string;
      };

      expect(row).toBeDefined();
      expect(row.subject_id).toBe(TOKEN_ADDRESS);
      const savedReport = JSON.parse(row.report_json) as ForensicReport;
      expect(savedReport.caseId).toBe(report.caseId);
      expect(savedReport.suspects.length).toBe(report.suspects.length);
    });
  });

  // ===== 3. Budget exhaustion =====
  describe("budget exhaustion", () => {
    it("throws CREDITS_EXHAUSTED when canAfford returns false", async () => {
      // Exhaust budget by recording max credits
      testDb
        .prepare(
          "INSERT OR REPLACE INTO budget_tracking (date, credits_used) VALUES (date('now'), 2000)"
        )
        .run();

      await expect(
        investigateToken({ tokenAddress: TOKEN_ADDRESS, chain: CHAIN })
      ).rejects.toThrow("CREDITS_EXHAUSTED");

      // No endpoints should have been called
      expect(tokenInfo).not.toHaveBeenCalled();
      expect(tokenOhlcv).not.toHaveBeenCalled();
    });
  });

  // ===== 4. SSE event emission =====
  describe("SSE event emission", () => {
    it("emits events in correct order during full flow", async () => {
      setupFullFlowMocks();

      const events: SSEEvent[] = [];
      const onProgress = (event: SSEEvent) => events.push(event);

      await investigateToken({
        tokenAddress: TOKEN_ADDRESS,
        chain: CHAIN,
        onProgress,
      });

      // Extract event types in order
      const types = events.map((e) => e.type);

      // Phase 0
      expect(types[0]).toBe("phase_start");
      expect(types[1]).toBe("phase_complete");

      // Phase 1
      expect(types[2]).toBe("phase_start");
      expect(types).toContain("step_update");
      expect(types).toContain("suspects_found");
      const phase1CompleteIdx = types.indexOf("phase_complete", 2);
      expect(phase1CompleteIdx).toBeGreaterThan(2);

      // Phase 2
      const phase2StartIdx = types.indexOf("phase_start", phase1CompleteIdx);
      expect(phase2StartIdx).toBeGreaterThan(phase1CompleteIdx);
      const phase2CompleteIdx = types.indexOf("phase_complete", phase2StartIdx);
      expect(phase2CompleteIdx).toBeGreaterThan(phase2StartIdx);

      // Phase 3
      const phase3StartIdx = types.indexOf("phase_start", phase2CompleteIdx);
      expect(phase3StartIdx).toBeGreaterThan(phase2CompleteIdx);
      expect(types).toContain("score_computed");

      // Final events
      const lastTwo = types.slice(-2);
      expect(lastTwo).toContain("phase_complete");
      expect(lastTwo).toContain("report_complete");

      // Verify phase_start data payloads carry correct phase numbers
      const phaseStarts = events.filter((e) => e.type === "phase_start");
      expect(phaseStarts.length).toBe(4);
      expect((phaseStarts[0].data as { phase: number }).phase).toBe(0);
      expect((phaseStarts[1].data as { phase: number }).phase).toBe(1);
      expect((phaseStarts[2].data as { phase: number }).phase).toBe(2);
      expect((phaseStarts[3].data as { phase: number }).phase).toBe(3);
    });

    it("emits report_complete as the final event on clean exit", async () => {
      setupCleanFlowMocks();

      const events: SSEEvent[] = [];
      await investigateToken({
        tokenAddress: TOKEN_ADDRESS,
        chain: CHAIN,
        onProgress: (event) => events.push(event),
      });

      expect(events.length).toBeGreaterThanOrEqual(3);
      // Last event should be report_complete
      expect(events[events.length - 1].type).toBe("report_complete");
      // Second to last should be phase_complete for phase 0
      expect(events[events.length - 2].type).toBe("phase_complete");
    });

    it("includes suspects in suspects_found event", async () => {
      setupFullFlowMocks();

      const events: SSEEvent[] = [];
      await investigateToken({
        tokenAddress: TOKEN_ADDRESS,
        chain: CHAIN,
        onProgress: (event) => events.push(event),
      });

      const suspectsEvent = events.find((e) => e.type === "suspects_found");
      expect(suspectsEvent).toBeDefined();
      const data = suspectsEvent!.data as { suspects: unknown[] };
      expect(data.suspects).toBeDefined();
      expect(data.suspects.length).toBeGreaterThan(0);
    });

    it("includes score and verdict in score_computed event", async () => {
      setupFullFlowMocks();

      const events: SSEEvent[] = [];
      await investigateToken({
        tokenAddress: TOKEN_ADDRESS,
        chain: CHAIN,
        onProgress: (event) => events.push(event),
      });

      const scoreEvent = events.find((e) => e.type === "score_computed");
      expect(scoreEvent).toBeDefined();
      const data = scoreEvent!.data as { suspicionScore: number; verdict: string };
      expect(typeof data.suspicionScore).toBe("number");
      expect(data.verdict).toBeTruthy();
    });
  });

  // ===== 5. Narrative failure graceful degradation =====
  describe("narrative failure graceful degradation", () => {
    it("completes investigation with narrative=null when generation fails", async () => {
      setupFullFlowMocks();
      vi.mocked(generateNarrative).mockRejectedValue(new Error("Gemini API rate limit"));

      const report = await investigateToken({
        tokenAddress: TOKEN_ADDRESS,
        chain: CHAIN,
      });

      // Investigation should still succeed
      expect(report.narrative).toBeNull();
      expect(report.metadata.degradedSections).toContain("narrative");
      // All phases should still complete
      expect(report.metadata.phasesCompleted).toEqual([0, 1, 2, 3]);
      // Score should still be computed
      expect(report.suspicionScore).toBeGreaterThanOrEqual(0);
      expect(report.verdict).toBeTruthy();
    });

    it("saves report to DB even when narrative fails", async () => {
      setupFullFlowMocks();
      vi.mocked(generateNarrative).mockRejectedValue(new Error("timeout"));

      const report = await investigateToken({
        tokenAddress: TOKEN_ADDRESS,
        chain: CHAIN,
      });

      const row = testDb
        .prepare("SELECT * FROM investigations WHERE id = ?")
        .get(report.caseId) as { id: string; report_json: string };

      expect(row).toBeDefined();
      const saved = JSON.parse(row.report_json) as ForensicReport;
      expect(saved.narrative).toBeNull();
    });
  });

  // ===== 6. Conditional perp check skip =====
  describe("conditional perp check skip", () => {
    it("does not call profilerPerpPositions when market cap < $10M", async () => {
      setupFullFlowMocks();

      // Override token info to have low market cap
      vi.mocked(tokenInfo).mockResolvedValue({
        success: true,
        data: makeTokenInfo({ market_cap_usd: 5_000_000 }),
      });

      await investigateToken({ tokenAddress: TOKEN_ADDRESS, chain: CHAIN });

      expect(profilerPerpPositions).not.toHaveBeenCalled();
    });

    it("calls profilerPerpPositions when market cap > $10M", async () => {
      setupFullFlowMocks();

      // Token info already has market_cap_usd = 500M (default)
      await investigateToken({ tokenAddress: TOKEN_ADDRESS, chain: CHAIN });

      expect(profilerPerpPositions).toHaveBeenCalled();
    });

    it("does not call profilerPerpPositions when market cap is undefined", async () => {
      setupFullFlowMocks();

      vi.mocked(tokenInfo).mockResolvedValue({
        success: true,
        data: makeTokenInfo({ market_cap_usd: undefined }),
      });

      await investigateToken({ tokenAddress: TOKEN_ADDRESS, chain: CHAIN });

      expect(profilerPerpPositions).not.toHaveBeenCalled();
    });
  });
});

// ===== 7. computePreMoveVolume =====
describe("computePreMoveVolume", () => {
  const anomaly: AnomalyWindow = {
    date: ANOMALY_DATE,
    timestamp: ANOMALY_UNIX,
    priceChangePct: 40,
    direction: "pump",
    openPrice: 1.0,
    closePrice: 1.4,
    highPrice: 1.5,
    lowPrice: 0.95,
    volume: 50_000_000,
  };

  it("sums volume of trades within 72h before anomaly", () => {
    const t6h = new Date((ANOMALY_UNIX - 6 * 3600) * 1000).toISOString();
    const t4h = new Date((ANOMALY_UNIX - 4 * 3600) * 1000).toISOString();

    const trades: DexTradeRow[] = [
      {
        trader_address: "0xtaker1",
        action: "BUY",
        token_address: TOKEN_ADDRESS,
        traded_token_address: "0xusdc",
        token_amount: 100_000,
        traded_token_amount: 100_000,
        estimated_value_usd: 100_000,
        block_timestamp: t6h,
        transaction_hash: "0x1",
      },
      {
        trader_address: "0xtaker2",
        action: "SELL",
        token_address: TOKEN_ADDRESS,
        traded_token_address: "0xusdc",
        token_amount: 50_000,
        traded_token_amount: 50_000,
        estimated_value_usd: 50_000,
        block_timestamp: t4h,
        transaction_hash: "0x2",
      },
    ];

    const result = computePreMoveVolume(trades, anomaly, TOKEN_ADDRESS);
    expect(result).toBe(150_000);
  });

  it("excludes trades after the anomaly timestamp", () => {
    const tAfter = new Date((ANOMALY_UNIX + 3600) * 1000).toISOString();

    const trades: DexTradeRow[] = [
      {
        trader_address: "0xtaker",
        action: "BUY",
        token_address: TOKEN_ADDRESS,
        traded_token_address: "0xusdc",
        token_amount: 200_000,
        traded_token_amount: 200_000,
        estimated_value_usd: 200_000,
        block_timestamp: tAfter,
        transaction_hash: "0x3",
      },
    ];

    const result = computePreMoveVolume(trades, anomaly, TOKEN_ADDRESS);
    expect(result).toBe(0);
  });

  it("excludes trades more than 72h before anomaly", () => {
    const tOld = new Date((ANOMALY_UNIX - 73 * 3600) * 1000).toISOString();

    const trades: DexTradeRow[] = [
      {
        trader_address: "0xtaker",
        action: "BUY",
        token_address: TOKEN_ADDRESS,
        traded_token_address: "0xusdc",
        token_amount: 500_000,
        traded_token_amount: 500_000,
        estimated_value_usd: 500_000,
        block_timestamp: tOld,
        transaction_hash: "0x4",
      },
    ];

    const result = computePreMoveVolume(trades, anomaly, TOKEN_ADDRESS);
    expect(result).toBe(0);
  });

  it("excludes trades for unrelated tokens", () => {
    const t6h = new Date((ANOMALY_UNIX - 6 * 3600) * 1000).toISOString();

    const trades: DexTradeRow[] = [
      {
        trader_address: "0xtaker",
        action: "BUY",
        token_address: "0xunrelatedtoken",
        traded_token_address: "0xusdc",
        token_amount: 999_999,
        traded_token_amount: 999_999,
        estimated_value_usd: 999_999,
        block_timestamp: t6h,
        transaction_hash: "0x5",
      },
    ];

    const result = computePreMoveVolume(trades, anomaly, TOKEN_ADDRESS);
    expect(result).toBe(0);
  });

  it("handles case-insensitive token address matching", () => {
    const t2h = new Date((ANOMALY_UNIX - 2 * 3600) * 1000).toISOString();

    const trades: DexTradeRow[] = [
      {
        trader_address: "0xtaker",
        action: "BUY",
        token_address: TOKEN_ADDRESS.toUpperCase(),
        traded_token_address: "0xusdc",
        token_amount: 75_000,
        traded_token_amount: 75_000,
        estimated_value_usd: 75_000,
        block_timestamp: t2h,
        transaction_hash: "0x6",
      },
    ];

    const result = computePreMoveVolume(trades, anomaly, TOKEN_ADDRESS);
    expect(result).toBe(75_000);
  });

  it("returns 0 for empty trades array", () => {
    const result = computePreMoveVolume([], anomaly, TOKEN_ADDRESS);
    expect(result).toBe(0);
  });

  it("counts both token_address and traded_token_address matches", () => {
    const t3h = new Date((ANOMALY_UNIX - 3 * 3600) * 1000).toISOString();

    const trades: DexTradeRow[] = [
      {
        trader_address: "0xtaker",
        action: "BUY",
        token_address: TOKEN_ADDRESS,
        traded_token_address: "0xusdc",
        token_amount: 60_000,
        traded_token_amount: 60_000,
        estimated_value_usd: 60_000,
        block_timestamp: t3h,
        transaction_hash: "0x7",
      },
      {
        trader_address: "0xtaker",
        action: "SELL",
        token_address: "0xusdc",
        traded_token_address: TOKEN_ADDRESS,
        token_amount: 40_000,
        traded_token_amount: 40_000,
        estimated_value_usd: 40_000,
        block_timestamp: t3h,
        transaction_hash: "0x8",
      },
    ];

    const result = computePreMoveVolume(trades, anomaly, TOKEN_ADDRESS);
    expect(result).toBe(100_000);
  });
});
