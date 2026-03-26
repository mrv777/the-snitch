import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-cache.db");

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

import { vi } from "vitest";
vi.mock("@/lib/cache/db", () => ({
  getDb: () => testDb,
}));

import {
  getCachedApiResponse,
  setCachedApiResponse,
  saveInvestigation,
  getInvestigationById,
  getInvestigationBySubject,
  getRecentInvestigations,
  updateInvestigationCardPaths,
  saveMonitorEvent,
  getRecentMonitorEvents,
  markEventInvestigated,
} from "@/lib/cache/queries";

describe("API cache", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns null for missing key", () => {
    expect(getCachedApiResponse("nonexistent")).toBeNull();
  });

  it("stores and retrieves data", () => {
    const data = { success: true, data: [1, 2, 3] };
    setCachedApiResponse("test-key", data);
    expect(getCachedApiResponse("test-key")).toEqual(data);
  });

  it("respects TTL expiration", () => {
    setCachedApiResponse("expired-key", { data: "old" }, 0);
    // TTL of 0 means already expired
    expect(getCachedApiResponse("expired-key")).toBeNull();
  });
});

describe("investigations", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("saves and retrieves by ID", () => {
    saveInvestigation({
      id: "case-20260323-ab12",
      mode: "token",
      subjectId: "0xABC123",
      chain: "ethereum",
      suspicionScore: 78,
      verdict: "SUSPICIOUS",
      reportJson: JSON.stringify({ test: true }),
    });

    const result = getInvestigationById("case-20260323-ab12");
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("token");
    expect(result!.suspicion_score).toBe(78);
    expect(result!.subject_id).toBe("0xabc123"); // lowercased
  });

  it("retrieves by subject", () => {
    saveInvestigation({
      id: "case-1",
      mode: "token",
      subjectId: "0xDEF456",
      reportJson: "{}",
    });

    const result = getInvestigationBySubject("0xDEF456", "token");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("case-1");
  });

  it("updates card paths after rendering", () => {
    saveInvestigation({
      id: "case-cards",
      mode: "token",
      subjectId: "0xCard",
      reportJson: "{}",
    });

    const before = getInvestigationById("case-cards");
    expect(before!.card_path).toBeNull();
    expect(before!.timeline_card_path).toBeNull();

    updateInvestigationCardPaths(
      "case-cards",
      "/public/images/case-cards_forensic.png",
      "/public/images/case-cards_timeline.png"
    );

    const after = getInvestigationById("case-cards");
    expect(after!.card_path).toBe("/public/images/case-cards_forensic.png");
    expect(after!.timeline_card_path).toBe("/public/images/case-cards_timeline.png");
  });

  it("returns recent investigations ordered by time", () => {
    for (let i = 0; i < 3; i++) {
      saveInvestigation({
        id: `case-${i}`,
        mode: "token",
        subjectId: `0x${i}`,
        reportJson: "{}",
      });
    }

    const recent = getRecentInvestigations(2);
    expect(recent).toHaveLength(2);
  });
});

describe("monitor events", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("saves and retrieves events", () => {
    saveMonitorEvent({
      eventType: "sm_trade",
      subjectId: "0xABC",
      summary: "Large trade detected",
      dataJson: JSON.stringify({ amount: 500000 }),
    });

    const events = getRecentMonitorEvents(10);
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe("sm_trade");
    expect(events[0].investigated).toBe(0);
  });

  it("marks event as investigated", () => {
    saveMonitorEvent({
      eventType: "flow_reversal",
      subjectId: "TOKEN",
      summary: "Flow reversed",
      dataJson: "{}",
    });

    const events = getRecentMonitorEvents(10);
    markEventInvestigated(events[0].id);

    const updated = getRecentMonitorEvents(10);
    expect(updated[0].investigated).toBe(1);
  });
});
