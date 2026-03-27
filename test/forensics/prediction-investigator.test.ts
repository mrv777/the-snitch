import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

import type {
  ForensicReport,
  SSEEvent,
} from "@/lib/forensics/types";
import type {
  NansenCliResponse,
  PmEventScreenerRow,
  PmPnlByMarketRow,
  PmTopHolderRow,
  PmTradeRow,
  PnlSummaryResponse,
  RelatedWalletRow,
  TransactionRow,
} from "@/lib/nansen/types";

// ===== TEST DB SETUP =====

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-pm-inv.db");

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

// ===== MOCKS =====

vi.mock("@/lib/cache/db", () => ({ getDb: () => testDb }));

vi.mock("@/lib/nansen/endpoints/prediction", () => ({
  pmEventScreener: vi.fn(),
  pmPnlByMarket: vi.fn(),
  pmTopHolders: vi.fn(),
  pmTradesByAddress: vi.fn(),
}));

vi.mock("@/lib/nansen/endpoints/profiler", () => ({
  profilerPnlSummary: vi.fn(),
  profilerTransactions: vi.fn(),
  profilerRelatedWallets: vi.fn(),
}));

vi.mock("@/lib/forensics/narrative-generator", () => ({
  generateNarrative: vi.fn(),
}));

// Import SUT + mocked modules AFTER vi.mock declarations
import { investigatePrediction } from "@/lib/forensics/prediction-investigator";

import {
  pmEventScreener,
  pmPnlByMarket,
  pmTopHolders,
  pmTradesByAddress,
} from "@/lib/nansen/endpoints/prediction";

import {
  profilerPnlSummary,
  profilerTransactions,
  profilerRelatedWallets,
} from "@/lib/nansen/endpoints/profiler";

import { generateNarrative } from "@/lib/forensics/narrative-generator";

// ===== MOCK DATA =====

const MOCK_EVENTS: NansenCliResponse<PmEventScreenerRow[]> = {
  success: true,
  data: [
    {
      event_id: "test-event-123",
      title: "Will BTC hit $200K by June 2026?",
      status: "resolved",
      outcome: "YES",
      resolution_date: "2026-03-15T00:00:00Z",
      markets: [{ market_id: "market-abc", title: "BTC $200K" }],
    },
  ],
};

const MOCK_PNL: NansenCliResponse<PmPnlByMarketRow[]> = {
  success: true,
  data: [
    {
      address: "0xPROFITER1",
      entity_name: "Whale",
      realized_pnl_usd: 340000,
      position_size_usd: 50000,
      outcome: "YES",
    },
    {
      address: "0xPROFITER2",
      entity_name: undefined,
      realized_pnl_usd: 120000,
      position_size_usd: 20000,
    },
    {
      address: "0xLOSER1",
      entity_name: undefined,
      realized_pnl_usd: -50000,
      position_size_usd: 50000,
    },
  ],
};

const MOCK_TOP_HOLDERS: NansenCliResponse<PmTopHolderRow[]> = {
  success: true,
  data: [
    {
      address: "0xPROFITER1",
      entity_name: "Whale",
      position_size_usd: 60000,
      side: "YES",
    },
    {
      address: "0xPROFITER2",
      entity_name: undefined,
      position_size_usd: 25000,
      side: "YES",
    },
  ],
};

const MOCK_TRADES: NansenCliResponse<PmTradeRow[]> = {
  success: true,
  data: [
    {
      market_id: "market-abc",
      market_title: "BTC $200K",
      side: "BUY",
      price: 0.65,
      size_usd: 50000,
      block_timestamp: "2026-03-01T12:00:00Z",
      transaction_hash: "0xTRADE1",
    },
  ],
};

const MOCK_PNL_SUMMARY: NansenCliResponse<PnlSummaryResponse> = {
  success: true,
  data: {
    top5_tokens: [],
    traded_token_count: 12,
    traded_times: 48,
    realized_pnl_usd: 500000,
    realized_pnl_percent: 280,
    win_rate: 85,
  },
};

const MOCK_TRANSACTIONS: NansenCliResponse<TransactionRow[]> = {
  success: true,
  data: [
    {
      chain: "ethereum",
      method: "transfer",
      tokens_sent: [],
      tokens_received: [],
      volume_usd: 10000,
      block_timestamp: "2026-03-02T10:00:00Z",
      transaction_hash: "0xTX1",
      source_type: "dex",
    },
  ],
};

const MOCK_RELATED_WALLETS: NansenCliResponse<RelatedWalletRow[]> = {
  success: true,
  data: [
    {
      address: "0xPROFITER2",
      entity_name: undefined,
      relationship_type: "funding",
    },
  ],
};

const MOCK_NARRATIVE = {
  caseNarrative: "This is a test narrative.",
  keyFindings: ["Finding 1", "Finding 2", "Finding 3"],
  shareableLine: "Test shareable line",
  verdictLabel: "SUSPICIOUS",
};

// ===== HELPERS =====

/** Configure all mocks for a complete full-flow investigation */
function setupFullFlowMocks() {
  vi.mocked(pmEventScreener).mockResolvedValue(MOCK_EVENTS);
  vi.mocked(pmPnlByMarket).mockResolvedValue(MOCK_PNL);
  vi.mocked(pmTopHolders).mockResolvedValue(MOCK_TOP_HOLDERS);
  vi.mocked(pmTradesByAddress).mockResolvedValue(MOCK_TRADES);
  vi.mocked(profilerPnlSummary).mockResolvedValue(MOCK_PNL_SUMMARY);
  vi.mocked(profilerTransactions).mockResolvedValue(MOCK_TRANSACTIONS);
  vi.mocked(profilerRelatedWallets).mockResolvedValue(MOCK_RELATED_WALLETS);
  vi.mocked(generateNarrative).mockResolvedValue(MOCK_NARRATIVE);
}

/** Configure mocks where event screener returns an event but PnL has no profiters */
function setupNoProfilersMocks() {
  vi.mocked(pmEventScreener).mockResolvedValue(MOCK_EVENTS);
  vi.mocked(pmPnlByMarket).mockResolvedValue({
    success: true,
    data: [
      {
        address: "0xLOSER1",
        entity_name: undefined,
        realized_pnl_usd: -50000,
        position_size_usd: 50000,
      },
    ],
  });
  vi.mocked(pmTopHolders).mockResolvedValue({ success: true, data: [] });
}

/** Configure mocks where event screener returns no matching events */
function setupEventNotFoundMocks() {
  vi.mocked(pmEventScreener).mockResolvedValue({
    success: true,
    data: [
      {
        event_id: "other-event-999",
        title: "Some Other Event",
        status: "resolved",
        outcome: "NO",
        resolution_date: "2026-01-01T00:00:00Z",
        markets: [],
      },
    ],
  });
}

// ===== TESTS =====

describe("investigatePrediction", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  // --- 1. Event not found ---
  describe("event not found", () => {
    it("returns early with empty report and earlyExit=true", async () => {
      setupEventNotFoundMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      expect(report.mode).toBe("prediction");
      expect(report.suspects).toEqual([]);
      expect(report.clusters).toEqual([]);
      expect(report.timeline).toEqual([]);
      expect(report.suspicionScore).toBe(0);
      expect(report.verdict).toBe("CLEAN");
      expect(report.metadata.earlyExit).toBe(true);
      expect(report.metadata.phasesCompleted).toContain(0);
      expect(report.metadata.degradedSections).toContain(
        "Event not found in screener results"
      );
      expect(report.subject.eventTitle).toBe(
        "Event not found in screener results"
      );
    });

    it("saves the report to the database", async () => {
      setupEventNotFoundMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      const row = testDb
        .prepare("SELECT * FROM investigations WHERE id = ?")
        .get(report.caseId) as { report_json: string } | undefined;

      expect(row).toBeDefined();
      const saved: ForensicReport = JSON.parse(row!.report_json);
      expect(saved.metadata.earlyExit).toBe(true);
    });

    it("does not call phase 1 endpoints", async () => {
      setupEventNotFoundMocks();

      await investigatePrediction({ eventId: "test-event-123" });

      expect(pmPnlByMarket).not.toHaveBeenCalled();
      expect(pmTopHolders).not.toHaveBeenCalled();
    });
  });

  // --- 2. No profiters ---
  describe("no profiters", () => {
    it("short-circuits with a clean PM report", async () => {
      setupNoProfilersMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      expect(report.mode).toBe("prediction");
      expect(report.suspects).toEqual([]);
      expect(report.suspicionScore).toBe(0);
      expect(report.verdict).toBe("CLEAN");
      expect(report.metadata.earlyExit).toBe(true);
      expect(report.metadata.degradedSections).toContain("no_profiters");
    });

    it("populates subject with event details", async () => {
      setupNoProfilersMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      expect(report.subject.eventTitle).toBe(
        "Will BTC hit $200K by June 2026?"
      );
      expect(report.subject.outcome).toBe("YES");
      expect(report.subject.marketId).toBe("market-abc");
      expect(report.subject.chain).toBe("polygon");
    });

    it("does not call phase 2 endpoints", async () => {
      setupNoProfilersMocks();

      await investigatePrediction({ eventId: "test-event-123" });

      expect(pmTradesByAddress).not.toHaveBeenCalled();
      expect(profilerPnlSummary).not.toHaveBeenCalled();
      expect(profilerTransactions).not.toHaveBeenCalled();
      expect(profilerRelatedWallets).not.toHaveBeenCalled();
    });

    it("completes phases 0 and 1 only", async () => {
      setupNoProfilersMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      expect(report.metadata.phasesCompleted).toEqual([0, 1]);
    });
  });

  // --- 3. Full flow ---
  describe("full flow", () => {
    it("returns a complete report with suspects, score, and narrative", async () => {
      setupFullFlowMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      expect(report.mode).toBe("prediction");
      expect(report.metadata.earlyExit).toBe(false);
      expect(report.metadata.phasesCompleted).toEqual([0, 1, 2, 3]);
    });

    it("ranks profiters correctly (top 2 only traced)", async () => {
      setupFullFlowMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      // Only profitable addresses should appear as suspects
      expect(report.suspects.length).toBe(2);
      expect(report.suspects[0].address).toBe("0xprofiter1"); // lowercased
      expect(report.suspects[0].rank).toBe(1);
      expect(report.suspects[0].pnlUsd).toBe(340000);
      expect(report.suspects[1].address).toBe("0xprofiter2");
      expect(report.suspects[1].rank).toBe(2);
      expect(report.suspects[1].pnlUsd).toBe(120000);
    });

    it("calls phase 2 endpoints for each profiter", async () => {
      setupFullFlowMocks();

      await investigatePrediction({ eventId: "test-event-123" });

      // 2 profiters, each gets 4 calls
      expect(pmTradesByAddress).toHaveBeenCalledTimes(2);
      expect(profilerPnlSummary).toHaveBeenCalledTimes(2);
      expect(profilerTransactions).toHaveBeenCalledTimes(2);
      expect(profilerRelatedWallets).toHaveBeenCalledTimes(2);
    });

    it("generates a narrative", async () => {
      setupFullFlowMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      expect(generateNarrative).toHaveBeenCalledTimes(1);
      expect(report.narrative).toEqual(MOCK_NARRATIVE);
    });

    it("computes a non-zero insider score", async () => {
      setupFullFlowMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      // With $340K top PnL and trades 14 days before resolution, score should be > 0
      expect(report.suspicionScore).toBeGreaterThan(0);
      expect(report.evidence.length).toBeGreaterThan(0);
    });

    it("saves the full report to the database", async () => {
      setupFullFlowMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      const row = testDb
        .prepare("SELECT * FROM investigations WHERE id = ?")
        .get(report.caseId) as
        | { mode: string; verdict: string; report_json: string }
        | undefined;

      expect(row).toBeDefined();
      expect(row!.mode).toBe("prediction");
      const saved: ForensicReport = JSON.parse(row!.report_json);
      expect(saved.suspects.length).toBe(2);
    });

    it("uses first market from event when marketId not provided", async () => {
      setupFullFlowMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      // Should use "market-abc" from the event's markets array
      expect(report.subject.marketId).toBe("market-abc");
      expect(pmPnlByMarket).toHaveBeenCalledWith("market-abc");
      expect(pmTopHolders).toHaveBeenCalledWith("market-abc");
    });

    it("uses provided marketId when given", async () => {
      setupFullFlowMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
        marketId: "custom-market-xyz",
      });

      expect(report.subject.marketId).toBe("custom-market-xyz");
      expect(pmPnlByMarket).toHaveBeenCalledWith("custom-market-xyz");
    });

    it("handles narrative generation failure gracefully", async () => {
      setupFullFlowMocks();
      vi.mocked(generateNarrative).mockRejectedValue(new Error("AI down"));

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      expect(report.narrative).toBeNull();
      expect(report.metadata.degradedSections).toContain("narrative");
    });
  });

  // --- 4. Budget exhaustion ---
  describe("budget exhaustion", () => {
    it("throws CREDITS_EXHAUSTED when budget is depleted", async () => {
      // Exhaust the budget before calling
      testDb
        .prepare(
          "INSERT OR REPLACE INTO budget_tracking (date, credits_used) VALUES (date('now'), 2000)"
        )
        .run();

      await expect(
        investigatePrediction({ eventId: "test-event-123" })
      ).rejects.toThrow("CREDITS_EXHAUSTED");
    });

    it("does not call any Nansen endpoints when budget is exhausted", async () => {
      testDb
        .prepare(
          "INSERT OR REPLACE INTO budget_tracking (date, credits_used) VALUES (date('now'), 2000)"
        )
        .run();

      try {
        await investigatePrediction({ eventId: "test-event-123" });
      } catch {
        // expected
      }

      expect(pmEventScreener).not.toHaveBeenCalled();
      expect(pmPnlByMarket).not.toHaveBeenCalled();
      expect(pmTopHolders).not.toHaveBeenCalled();
    });
  });

  // --- 5. SSE events ---
  describe("SSE events", () => {
    it("emits correct phase progression during full flow", async () => {
      setupFullFlowMocks();
      const events: SSEEvent[] = [];

      await investigatePrediction({
        eventId: "test-event-123",
        onProgress: (event) => events.push(event),
      });

      // Extract event types
      const types = events.map((e) => e.type);

      // Phase 0
      expect(types).toContain("phase_start");
      expect(types).toContain("phase_complete");

      // Suspects found after phase 1
      expect(types).toContain("suspects_found");

      // Score computed during phase 3
      expect(types).toContain("score_computed");

      // Final report
      expect(types).toContain("report_complete");
    });

    it("emits phase_start before phase_complete for each phase", async () => {
      setupFullFlowMocks();
      const events: SSEEvent[] = [];

      await investigatePrediction({
        eventId: "test-event-123",
        onProgress: (event) => events.push(event),
      });

      // Check all 4 phases have start before complete
      for (const phaseNum of [0, 1, 2, 3]) {
        const startIdx = events.findIndex(
          (e) =>
            e.type === "phase_start" &&
            (e.data as { phase?: number }).phase === phaseNum
        );
        const completeIdx = events.findIndex(
          (e) =>
            e.type === "phase_complete" &&
            (e.data as { phase?: number }).phase === phaseNum
        );
        expect(startIdx).toBeGreaterThanOrEqual(0);
        expect(completeIdx).toBeGreaterThan(startIdx);
      }
    });

    it("emits report_complete as the last event", async () => {
      setupFullFlowMocks();
      const events: SSEEvent[] = [];

      await investigatePrediction({
        eventId: "test-event-123",
        onProgress: (event) => events.push(event),
      });

      const lastEvent = events[events.length - 1];
      expect(lastEvent.type).toBe("report_complete");
    });

    it("emits report_complete even on early exit (event not found)", async () => {
      setupEventNotFoundMocks();
      const events: SSEEvent[] = [];

      await investigatePrediction({
        eventId: "test-event-123",
        onProgress: (event) => events.push(event),
      });

      const reportEvents = events.filter((e) => e.type === "report_complete");
      expect(reportEvents.length).toBe(1);
    });

    it("emits report_complete on no-profiters short-circuit", async () => {
      setupNoProfilersMocks();
      const events: SSEEvent[] = [];

      await investigatePrediction({
        eventId: "test-event-123",
        onProgress: (event) => events.push(event),
      });

      const reportEvents = events.filter((e) => e.type === "report_complete");
      expect(reportEvents.length).toBe(1);
    });
  });

  // --- 6. Report structure ---
  describe("report structure", () => {
    it('has mode="prediction"', async () => {
      setupFullFlowMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      expect(report.mode).toBe("prediction");
    });

    it("subject contains eventTitle, outcome, and marketId", async () => {
      setupFullFlowMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      expect(report.subject.eventTitle).toBe(
        "Will BTC hit $200K by June 2026?"
      );
      expect(report.subject.outcome).toBe("YES");
      expect(report.subject.marketId).toBe("market-abc");
      expect(report.subject.chain).toBe("polygon");
      expect(report.subject.resolutionDate).toBe("2026-03-15T00:00:00Z");
    });

    it("has a valid caseId format", async () => {
      setupFullFlowMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      // case-YYYYMMDD-XXXX
      expect(report.caseId).toMatch(/^case-\d{8}-[a-f0-9]{4}$/);
    });

    it("has empty graph (PM mode skips wallet graph)", async () => {
      setupFullFlowMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      expect(report.graph).toEqual({ nodes: [], edges: [] });
    });

    it("has null anomaly (PM mode does not use anomaly detection)", async () => {
      setupFullFlowMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      expect(report.anomaly).toBeNull();
    });

    it("tracks credits used across all phases", async () => {
      setupFullFlowMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      // Phase 0 = 50, Phase 1 = 100, Phase 2 = variable (per profiter calls)
      expect(report.metadata.creditsUsed).toBeGreaterThanOrEqual(150);
    });

    it("tracks duration in milliseconds", async () => {
      setupFullFlowMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      expect(report.metadata.duration).toBeGreaterThanOrEqual(0);
      expect(typeof report.metadata.duration).toBe("number");
    });

    it("has evidence items from insider scorer", async () => {
      setupFullFlowMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      expect(report.evidence.length).toBeGreaterThan(0);
      for (const item of report.evidence) {
        expect(item).toHaveProperty("factor");
        expect(item).toHaveProperty("weight");
        expect(item).toHaveProperty("subScore");
        expect(item).toHaveProperty("weightedScore");
        expect(item).toHaveProperty("description");
      }
    });

    it("verdict corresponds to suspicion score", async () => {
      setupFullFlowMocks();

      const report = await investigatePrediction({
        eventId: "test-event-123",
      });

      const score = report.suspicionScore;
      if (score >= 80) expect(report.verdict).toBe("HIGHLY_SUSPICIOUS");
      else if (score >= 60) expect(report.verdict).toBe("SUSPICIOUS");
      else if (score >= 40) expect(report.verdict).toBe("NOTABLE");
      else if (score >= 20) expect(report.verdict).toBe("INCONCLUSIVE");
      else expect(report.verdict).toBe("CLEAN");
    });
  });
});
