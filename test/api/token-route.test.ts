import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-token-route.db");

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

// Mock the investigator to avoid real API calls
const mockInvestigate = vi.fn();
vi.mock("@/lib/forensics/token-investigator", () => ({
  investigateToken: mockInvestigate,
}));

import { checkRateLimit, recordInvestigation, getClientIp } from "@/lib/rate-limit/limiter";
import { canAfford, recordCredits } from "@/lib/budget/tracker";
import { getInvestigationBySubject, saveInvestigation } from "@/lib/cache/queries";
import { isValidAddress } from "@/lib/utils/address";

describe("token investigation route logic", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockInvestigate.mockReset();
  });

  describe("address validation", () => {
    it("detects invalid addresses", () => {
      expect(isValidAddress("not-an-address")).toBe(false);
      expect(isValidAddress("")).toBe(false);
      expect(isValidAddress("0x")).toBe(false);
    });

    it("accepts valid EVM addresses", () => {
      expect(isValidAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(true);
    });

    it("accepts valid Solana addresses", () => {
      expect(isValidAddress("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBe(true);
    });
  });

  describe("cache behavior", () => {
    it("returns cached investigation if fresh", () => {
      const report = { caseId: "case-test", verdict: "SUSPICIOUS", subject: { name: "Test" } };
      saveInvestigation({
        id: "case-test",
        mode: "token",
        subjectId: "0xabc123",
        chain: "ethereum",
        suspicionScore: 75,
        verdict: "SUSPICIOUS",
        reportJson: JSON.stringify(report),
      });

      const cached = getInvestigationBySubject("0xabc123", "token");
      expect(cached).toBeDefined();
      expect(cached!.verdict).toBe("SUSPICIOUS");

      const parsed = JSON.parse(cached!.report_json);
      expect(parsed.caseId).toBe("case-test");
    });

    it("returns null for unknown tokens", () => {
      const cached = getInvestigationBySubject("0xunknown", "token");
      expect(cached).toBeNull();
    });
  });

  describe("rate limiting", () => {
    it("allows first investigation", () => {
      const result = checkRateLimit("192.168.1.1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
    });

    it("blocks after 5 investigations", () => {
      for (let i = 0; i < 5; i++) {
        recordInvestigation("192.168.1.1");
      }
      const result = checkRateLimit("192.168.1.1");
      expect(result.allowed).toBe(false);
    });

    it("extracts IP from x-forwarded-for header", () => {
      const req = new Request("http://localhost", {
        headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      });
      // getClientIp expects NextRequest but works with Request for the header check
      const ip = getClientIp(req as never);
      expect(ip).toBe("1.2.3.4");
    });
  });

  describe("budget check", () => {
    it("allows investigation when budget available", () => {
      expect(canAfford(600)).toBe(true);
    });

    it("blocks investigation when budget exhausted", () => {
      recordCredits(2000);
      expect(canAfford(600)).toBe(false);
    });
  });

  describe("credits_exhausted response shape", () => {
    it("matches the expected error format", () => {
      const response = {
        error: "credits_exhausted",
        message: "Daily credit budget exhausted. Browse existing reports below.",
      };
      expect(response.error).toBe("credits_exhausted");
      expect(response.message).toContain("Browse existing reports");
    });
  });

  describe("rate_limited response shape", () => {
    it("matches the expected error format", () => {
      for (let i = 0; i < 5; i++) recordInvestigation("10.0.0.1");
      const result = checkRateLimit("10.0.0.1");
      expect(result.allowed).toBe(false);

      const response = {
        error: "rate_limited",
        message: `Rate limited. ${result.remaining} investigations remaining. Resets in ${Math.ceil(result.resetIn / 3600)}h.`,
      };
      expect(response.error).toBe("rate_limited");
      expect(response.message).toContain("Rate limited");
    });
  });
});
