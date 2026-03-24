import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-budget.db");

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

describe("budget tracker", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("starts with zero credits used", () => {
    const status = getBudgetStatus();
    expect(status.creditsUsed).toBe(0);
    expect(status.canInvestigate).toBe(true);
    expect(status.dailyCap).toBe(2000);
    expect(status.remaining).toBe(2000);
  });

  it("tracks recorded credits", () => {
    recordCredits(500);
    const status = getBudgetStatus();
    expect(status.creditsUsed).toBe(500);
    expect(status.remaining).toBe(1500);
  });

  it("accumulates credits", () => {
    recordCredits(300);
    recordCredits(200);
    recordCredits(100);
    const status = getBudgetStatus();
    expect(status.creditsUsed).toBe(600);
    expect(status.remaining).toBe(1400);
  });

  it("canAfford checks remaining budget", () => {
    recordCredits(1900);
    expect(canAfford(100)).toBe(true);
    expect(canAfford(200)).toBe(false);
  });

  it("reports cannot investigate when exhausted", () => {
    recordCredits(2000);
    const status = getBudgetStatus();
    expect(status.canInvestigate).toBe(false);
    expect(status.remaining).toBe(0);
  });
});
