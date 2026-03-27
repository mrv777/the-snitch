import { describe, it, expect, vi, beforeEach } from "vitest";

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

import {
  profilerTransactions,
  profilerCounterparties,
  profilerRelatedWallets,
  profilerPerpPositions,
  profilerTrace,
  profilerCompare,
  profilerBatch,
} from "@/lib/nansen/endpoints/profiler";
import { tokenFlowIntelligence, tokenOhlcv } from "@/lib/nansen/endpoints/token";
import {
  pmPnlByMarket,
  pmPnlByAddress,
  pmTradesByAddress,
  pmTopHolders,
} from "@/lib/nansen/endpoints/prediction";

function setGenericFixture() {
  mockExecFile.mockResolvedValue({
    stdout: JSON.stringify({ success: true, data: { data: [] } }),
    stderr: "",
  });
}

describe("profiler endpoints (additional)", () => {
  beforeEach(() => mockExecFile.mockReset());

  it("profilerTransactions builds correct args", async () => {
    setGenericFixture();
    await profilerTransactions("0xABC", "ethereum", 30);
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      [
        "research",
        "profiler",
        "transactions",
        "--address",
        "0xABC",
        "--chain",
        "ethereum",
        "--days",
        "30",
      ],
      expect.any(Object)
    );
  });

  it("profilerCounterparties builds correct args", async () => {
    setGenericFixture();
    await profilerCounterparties("0xABC", "ethereum", 30);
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      [
        "research",
        "profiler",
        "counterparties",
        "--address",
        "0xABC",
        "--chain",
        "ethereum",
        "--days",
        "30",
      ],
      expect.any(Object)
    );
  });

  it("profilerRelatedWallets builds correct args (no --days)", async () => {
    setGenericFixture();
    await profilerRelatedWallets("0xABC", "ethereum");
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      [
        "research",
        "profiler",
        "related-wallets",
        "--address",
        "0xABC",
        "--chain",
        "ethereum",
      ],
      expect.any(Object)
    );
  });

  it("profilerPerpPositions builds correct args (no --chain)", async () => {
    setGenericFixture();
    await profilerPerpPositions("0xABC");
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      ["research", "profiler", "perp-positions", "--address", "0xABC"],
      expect.any(Object)
    );
  });

  it("profilerTrace builds correct args with depth and width", async () => {
    setGenericFixture();
    await profilerTrace("0xABC", "ethereum", 2, 3);
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      [
        "research",
        "profiler",
        "trace",
        "--address",
        "0xABC",
        "--chain",
        "ethereum",
        "--depth",
        "2",
        "--width",
        "3",
      ],
      expect.any(Object)
    );
  });

  it("profilerCompare builds correct args with comma-joined addresses", async () => {
    setGenericFixture();
    await profilerCompare("0xA", "0xB", "ethereum");
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      [
        "research",
        "profiler",
        "compare",
        "--addresses",
        "0xA,0xB",
        "--chain",
        "ethereum",
      ],
      expect.any(Object)
    );
  });

  it("profilerBatch builds correct args with default include", async () => {
    setGenericFixture();
    await profilerBatch(["0xA", "0xB"], "ethereum");
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      [
        "research",
        "profiler",
        "batch",
        "--addresses",
        "0xA,0xB",
        "--chain",
        "ethereum",
        "--include",
        "balance,pnl-summary",
      ],
      expect.any(Object)
    );
  });
});

describe("token endpoints (CLI)", () => {
  beforeEach(() => mockExecFile.mockReset());

  it("tokenFlowIntelligence builds correct args", async () => {
    setGenericFixture();
    await tokenFlowIntelligence("0xWETH", "ethereum", 30);
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      [
        "research",
        "token",
        "flow-intelligence",
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

describe("token endpoints (REST)", () => {
  const mockFetchForOhlcv = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetchForOhlcv);
    mockFetchForOhlcv.mockReset();
    mockFetchForOhlcv.mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );
    process.env.NANSEN_API_KEY = "test-key";
  });

  it("tokenOhlcv calls REST API with correct URL and body", async () => {
    await tokenOhlcv("0xWETH", "ethereum", "1d", 90);

    expect(mockFetchForOhlcv).toHaveBeenCalledWith(
      "https://api.nansen.ai/api/v1/tgm/token-ohlcv",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          apiKey: "test-key",
        }),
        body: expect.stringContaining("0xWETH"),
      })
    );

    // Verify body structure
    const callArgs = mockFetchForOhlcv.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.token_address).toBe("0xWETH");
    expect(body.chain).toBe("ethereum");
    expect(body.timeframe).toBe("1d");
    expect(body.date).toHaveProperty("from");
    expect(body.date).toHaveProperty("to");
  });
});

describe("prediction-market endpoints (additional)", () => {
  beforeEach(() => mockExecFile.mockReset());

  it("pmPnlByMarket builds correct args", async () => {
    setGenericFixture();
    await pmPnlByMarket("market-123");
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      [
        "research",
        "prediction-market",
        "pnl-by-market",
        "--market-id",
        "market-123",
      ],
      expect.any(Object)
    );
  });

  it("pmPnlByAddress builds correct args", async () => {
    setGenericFixture();
    await pmPnlByAddress("0xABC");
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      [
        "research",
        "prediction-market",
        "pnl-by-address",
        "--address",
        "0xABC",
      ],
      expect.any(Object)
    );
  });

  it("pmTradesByAddress builds correct args", async () => {
    setGenericFixture();
    await pmTradesByAddress("0xABC");
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      [
        "research",
        "prediction-market",
        "trades-by-address",
        "--address",
        "0xABC",
      ],
      expect.any(Object)
    );
  });

  it("pmTopHolders builds correct args", async () => {
    setGenericFixture();
    await pmTopHolders("market-123");
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      [
        "research",
        "prediction-market",
        "top-holders",
        "--market-id",
        "market-123",
      ],
      expect.any(Object)
    );
  });
});
