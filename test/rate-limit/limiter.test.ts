import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// We need to set up an in-memory DB before importing the limiter,
// so we mock the db module to use a test database.
const TEST_DB_PATH = path.join(process.cwd(), "data", "test-limiter.db");

// Clean up any leftover test DB
function cleanTestDb() {
  for (const ext of ["", "-wal", "-shm"]) {
    try {
      fs.unlinkSync(TEST_DB_PATH + ext);
    } catch {
      // ignore
    }
  }
}

// Create a fresh test DB with the schema
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

// Mock the db module to return our test DB
let testDb: Database.Database;

import { vi } from "vitest";
vi.mock("@/lib/cache/db", () => ({
  getDb: () => testDb,
}));

// Import after mock is set up
import {
  checkRateLimit,
  recordInvestigation,
  getClientIp,
} from "@/lib/rate-limit/limiter";

describe("rate limiter", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("allows first request", () => {
    const result = checkRateLimit("192.168.1.1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5); // hasn't recorded yet
  });

  it("tracks remaining after recording", () => {
    recordInvestigation("192.168.1.1");
    const result = checkRateLimit("192.168.1.1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks after 5 investigations", () => {
    for (let i = 0; i < 5; i++) {
      recordInvestigation("192.168.1.1");
    }
    const result = checkRateLimit("192.168.1.1");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetIn).toBeGreaterThan(0);
  });

  it("tracks IPs independently", () => {
    for (let i = 0; i < 5; i++) {
      recordInvestigation("192.168.1.1");
    }

    const blocked = checkRateLimit("192.168.1.1");
    expect(blocked.allowed).toBe(false);

    const allowed = checkRateLimit("192.168.1.2");
    expect(allowed.allowed).toBe(true);
    expect(allowed.remaining).toBe(5);
  });
});

describe("getClientIp", () => {
  it("extracts from x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("returns unknown when no headers", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBe("unknown");
  });
});
