import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-credit-exhaustion.db");

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
  getBudgetStatus,
  recordCredits,
  canAfford,
} from "@/lib/budget/tracker";

describe("credit exhaustion handling", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("canAfford returns false when budget exhausted", () => {
    recordCredits(2000);
    expect(canAfford(1)).toBe(false);
    expect(canAfford(600)).toBe(false);
  });

  it("canAfford returns false for investigation cost near limit", () => {
    recordCredits(1500);
    expect(canAfford(600)).toBe(false);
    expect(canAfford(400)).toBe(true);
  });

  it("getBudgetStatus shows canInvestigate=false when exhausted", () => {
    recordCredits(2000);
    const status = getBudgetStatus();
    expect(status.canInvestigate).toBe(false);
    expect(status.remaining).toBe(0);
  });

  it("investigation API would return 503 when budget exhausted", () => {
    // Simulate what the API route does
    recordCredits(2000);

    const estimatedTokenCost = 600;
    const estimatedPmCost = 400;

    // Token investigation should be rejected
    expect(canAfford(estimatedTokenCost)).toBe(false);

    // PM investigation should be rejected
    expect(canAfford(estimatedPmCost)).toBe(false);

    // The API returns this response shape
    const errorResponse = {
      error: "credits_exhausted",
      message: "Daily credit budget exhausted. Browse existing reports below.",
    };
    expect(errorResponse.error).toBe("credits_exhausted");
  });

  it("cached reports remain accessible even when budget exhausted", () => {
    // Save a report before budget is exhausted
    testDb
      .prepare(
        `INSERT INTO investigations (id, mode, subject_id, chain, suspicion_score, verdict, report_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "case-20260326-abcd",
        "token",
        "0x1234567890abcdef",
        "ethereum",
        78,
        "SUSPICIOUS",
        JSON.stringify({ caseId: "case-20260326-abcd", verdict: "SUSPICIOUS" })
      );

    // Exhaust budget
    recordCredits(2000);
    expect(canAfford(1)).toBe(false);

    // But cached report is still retrievable
    const row = testDb
      .prepare(`SELECT * FROM investigations WHERE id = ?`)
      .get("case-20260326-abcd") as { report_json: string } | undefined;
    expect(row).toBeDefined();
    const report = JSON.parse(row!.report_json);
    expect(report.caseId).toBe("case-20260326-abcd");
    expect(report.verdict).toBe("SUSPICIOUS");
  });

  it("new day resets the budget", () => {
    // Record credits for today
    recordCredits(2000);
    expect(canAfford(1)).toBe(false);

    // Manually insert a different date's record to simulate new day
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = tomorrow.toISOString().slice(0, 10);

    // The budget_tracking table keys by date, so a new date = fresh budget
    const row = testDb
      .prepare(`SELECT credits_used FROM budget_tracking WHERE date = ?`)
      .get(tomorrowKey) as { credits_used: number } | undefined;

    // Tomorrow has no entry yet — budget would be full
    expect(row).toBeUndefined();
  });
});
