import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-monitor-routes.db");

function cleanTestDb() {
  for (const ext of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(TEST_DB_PATH + ext); } catch { /* ignore */ }
  }
}

function createTestDb(): Database.Database {
  cleanTestDb();
  const db = new Database(TEST_DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY, response_json TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()), ttl_seconds INTEGER NOT NULL DEFAULT 86400);
    CREATE TABLE IF NOT EXISTS investigations (id TEXT PRIMARY KEY, mode TEXT NOT NULL, subject_id TEXT NOT NULL, chain TEXT, suspicion_score INTEGER, verdict TEXT, report_json TEXT NOT NULL, card_path TEXT, timeline_card_path TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), ttl_seconds INTEGER NOT NULL DEFAULT 86400);
    CREATE TABLE IF NOT EXISTS monitor_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, subject_id TEXT NOT NULL, summary TEXT NOT NULL, data_json TEXT NOT NULL, investigated INTEGER DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
    CREATE TABLE IF NOT EXISTS rate_limits (ip TEXT NOT NULL, timestamp INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS budget_tracking (date TEXT NOT NULL, credits_used REAL NOT NULL DEFAULT 0, PRIMARY KEY (date));
  `);
  return db;
}

let testDb: Database.Database;
vi.mock("@/lib/cache/db", () => ({ getDb: () => testDb }));

import {
  saveMonitorEvent,
  getRecentMonitorEvents,
  markEventInvestigated,
} from "@/lib/cache/queries";
import { canAfford, recordCredits } from "@/lib/budget/tracker";

describe("monitor events API logic", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  describe("static mode", () => {
    it("returns all events as JSON", () => {
      saveMonitorEvent({
        eventType: "sm_trade",
        subjectId: "0xABC",
        summary: "Large smart money trade detected",
        dataJson: JSON.stringify({ amount_usd: 150000, token: "PEPE" }),
      });
      saveMonitorEvent({
        eventType: "flow_reversal",
        subjectId: "0xDEF",
        summary: "Net flow reversal for ETH",
        dataJson: JSON.stringify({ token: "ETH", direction: "outflow" }),
      });

      const events = getRecentMonitorEvents(50);
      expect(events).toHaveLength(2);
      // Ordered by created_at DESC — both inserted in same second, so order by id DESC
      const types = events.map((e) => e.event_type);
      expect(types).toContain("sm_trade");
      expect(types).toContain("flow_reversal");
    });

    it("respects limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        saveMonitorEvent({
          eventType: "sm_trade",
          subjectId: `0x${i}`,
          summary: `Event ${i}`,
          dataJson: "{}",
        });
      }

      const events = getRecentMonitorEvents(3);
      expect(events).toHaveLength(3);
    });
  });

  describe("event lifecycle", () => {
    it("can mark events as investigated", () => {
      saveMonitorEvent({
        eventType: "pm_swing",
        subjectId: "event-123",
        summary: "Odds swing 40%",
        dataJson: "{}",
      });

      const events = getRecentMonitorEvents(10);
      expect(events[0].investigated).toBe(0);

      markEventInvestigated(events[0].id);

      const updated = getRecentMonitorEvents(10);
      expect(updated[0].investigated).toBe(1);
    });
  });
});

describe("monitor poll route logic", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("blocks when budget is exhausted", () => {
    recordCredits(2000);
    expect(canAfford(150)).toBe(false);
  });

  it("allows poll when budget is available", () => {
    expect(canAfford(150)).toBe(true);
  });
});
