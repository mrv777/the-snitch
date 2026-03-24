import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

const mockExecFile = vi.hoisted(() => vi.fn());

// Mock cache
vi.mock("@/lib/cache/queries", () => ({
  getCachedApiResponse: vi.fn().mockReturnValue(null),
  setCachedApiResponse: vi.fn(),
}));

// Mock child_process + util.promisify
vi.mock("child_process", () => ({
  execFile: mockExecFile,
}));
vi.mock("util", () => ({
  promisify: () => mockExecFile,
}));

const FIXTURES_DIR = path.join(process.cwd(), "test", "fixtures");

function loadFixture(name: string): Record<string, unknown> | null {
  const filePath = path.join(FIXTURES_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function mockFixture(name: string): boolean {
  const fixture = loadFixture(name);
  if (!fixture) return false;
  mockExecFile.mockResolvedValue({
    stdout: JSON.stringify(fixture),
    stderr: "",
  });
  return true;
}

import { profilerSearch, profilerPnlSummary } from "@/lib/nansen/endpoints/profiler";
import { tokenInfo, tokenWhoBoughtSold, tokenDexTrades } from "@/lib/nansen/endpoints/token";
import { smartMoneyDexTrades, smartMoneyNetflow } from "@/lib/nansen/endpoints/smart-money";
import { pmEventScreener, pmMarketScreener } from "@/lib/nansen/endpoints/prediction";

describe("profiler endpoints", () => {
  beforeEach(() => mockExecFile.mockReset());

  it("profilerSearch builds correct args", async () => {
    if (!mockFixture("profiler-search")) return;
    await profilerSearch("vitalik");
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      ["research", "profiler", "search", "--query", "vitalik"],
      expect.any(Object)
    );
  });

  it("profilerPnlSummary builds correct args", async () => {
    if (!mockFixture("profiler-pnl-summary")) return;
    await profilerPnlSummary("0xABC", "ethereum", 365);
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      [
        "research",
        "profiler",
        "pnl-summary",
        "--address",
        "0xABC",
        "--chain",
        "ethereum",
        "--days",
        "365",
      ],
      expect.any(Object)
    );
  });
});

describe("token endpoints", () => {
  beforeEach(() => mockExecFile.mockReset());

  it("tokenInfo builds correct args", async () => {
    if (!mockFixture("token-info")) return;
    await tokenInfo("0xWETH", "ethereum");
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      ["research", "token", "info", "--token", "0xWETH", "--chain", "ethereum"],
      expect.any(Object)
    );
  });

  it("tokenWhoBoughtSold builds correct args", async () => {
    if (!mockFixture("token-who-bought-sold")) return;
    await tokenWhoBoughtSold("0xWETH", "ethereum", 30);
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      [
        "research",
        "token",
        "who-bought-sold",
        "--token",
        "0xWETH",
        "--chain",
        "ethereum",
        "--days",
        "30",
      ],
      expect.any(Object)
    );
  });

  it("tokenDexTrades builds correct args", async () => {
    if (!mockFixture("token-dex-trades")) return;
    await tokenDexTrades("0xWETH", "ethereum", 30);
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      [
        "research",
        "token",
        "dex-trades",
        "--token",
        "0xWETH",
        "--chain",
        "ethereum",
        "--days",
        "30",
      ],
      expect.any(Object)
    );
  });
});

describe("smart-money endpoints", () => {
  beforeEach(() => mockExecFile.mockReset());

  it("smartMoneyDexTrades builds correct args", async () => {
    if (!mockFixture("smart-money-dex-trades")) return;
    await smartMoneyDexTrades("ethereum");
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      ["research", "smart-money", "dex-trades", "--chain", "ethereum"],
      expect.any(Object)
    );
  });

  it("smartMoneyNetflow builds correct args", async () => {
    if (!mockFixture("smart-money-netflow")) return;
    await smartMoneyNetflow("ethereum");
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      ["research", "smart-money", "netflow", "--chain", "ethereum"],
      expect.any(Object)
    );
  });
});

describe("prediction-market endpoints", () => {
  beforeEach(() => mockExecFile.mockReset());

  it("pmEventScreener builds correct args", async () => {
    if (!mockFixture("pm-event-screener")) return;
    await pmEventScreener();
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      ["research", "prediction-market", "event-screener"],
      expect.any(Object)
    );
  });

  it("pmMarketScreener builds correct args", async () => {
    if (!mockFixture("pm-market-screener")) return;
    await pmMarketScreener();
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      ["research", "prediction-market", "market-screener"],
      expect.any(Object)
    );
  });
});
