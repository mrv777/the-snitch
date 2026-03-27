import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

import {
  MOCK_SM_DEX_TRADES,
  MOCK_SM_NETFLOW_CURRENT,
  MOCK_PM_SCREENER_CURRENT,
} from "@/test/fixtures/monitor-api-responses";

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-monitor.db");

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
  fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
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

// Mock the database before importing modules that use it
vi.mock("@/lib/cache/db", () => ({
  getDb: () => testDb,
}));

// Mock Nansen endpoints to return fixture data
vi.mock("@/lib/nansen/endpoints/smart-money", () => ({
  smartMoneyDexTrades: vi.fn().mockResolvedValue({
    success: true,
    data: MOCK_SM_DEX_TRADES,
  }),
  smartMoneyNetflow: vi.fn().mockResolvedValue({
    success: true,
    data: MOCK_SM_NETFLOW_CURRENT,
  }),
}));

vi.mock("@/lib/nansen/endpoints/prediction", () => ({
  pmMarketScreener: vi.fn().mockResolvedValue({
    success: true,
    data: MOCK_PM_SCREENER_CURRENT,
  }),
}));

import { pollOnce, getMonitorStats } from "@/lib/monitor/watcher";
import { getRecentMonitorEvents, saveMonitorEvent } from "@/lib/cache/queries";

describe("pollOnce", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("detects events and saves them to SQLite", async () => {
    const result = await pollOnce();

    // Should have found some events (large trades, accumulation)
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.creditsUsed).toBeGreaterThan(0);

    // Events should be persisted
    const savedEvents = getRecentMonitorEvents(100);
    expect(savedEvents.length).toBe(result.events.length);
  });

  it("returns no events when budget is exhausted", async () => {
    // Exhaust the budget
    const db = testDb;
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(
      "INSERT INTO budget_tracking (date, credits_used) VALUES (?, ?)"
    ).run(today, 99999);

    const result = await pollOnce();
    expect(result.events).toHaveLength(0);
    expect(result.creditsUsed).toBe(0);
    expect(result.errors).toContain(
      "Insufficient credits for monitor poll cycle"
    );
  });

  it("records credits used", async () => {
    await pollOnce();

    const db = testDb;
    const today = new Date().toISOString().slice(0, 10);
    const row = db
      .prepare("SELECT credits_used FROM budget_tracking WHERE date = ?")
      .get(today) as { credits_used: number } | undefined;

    expect(row).toBeDefined();
    expect(row!.credits_used).toBeGreaterThan(0);
  });

  it("saves events with correct structure", async () => {
    const result = await pollOnce();

    if (result.events.length > 0) {
      const savedEvents = getRecentMonitorEvents(100);
      const first = savedEvents[0];

      expect(first.event_type).toBeTruthy();
      expect(first.subject_id).toBeTruthy();
      expect(first.summary).toBeTruthy();
      expect(first.data_json).toBeTruthy();
      expect(first.investigated).toBe(0);

      // data_json should be valid JSON
      expect(() => JSON.parse(first.data_json)).not.toThrow();
    }
  });
});

describe("getMonitorStats", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns default stats when no events exist", () => {
    const stats = getMonitorStats();
    expect(stats.totalFlagged).toBe(0);
    expect(stats.totalScanned).toBeGreaterThanOrEqual(142); // minimum for demo
    expect(stats.lastScanAt).toBeNull();
  });

  it("counts flagged events", () => {
    saveMonitorEvent({
      eventType: "sm_large_trade",
      subjectId: "0xABC",
      summary: "Test trade",
      dataJson: "{}",
    });
    saveMonitorEvent({
      eventType: "flow_reversal",
      subjectId: "0xDEF",
      summary: "Test reversal",
      dataJson: "{}",
    });

    const stats = getMonitorStats();
    expect(stats.totalFlagged).toBe(2);
    expect(stats.lastScanAt).not.toBeNull();
    expect(stats.totalScanned).toBeGreaterThanOrEqual(stats.totalFlagged);
  });
});
