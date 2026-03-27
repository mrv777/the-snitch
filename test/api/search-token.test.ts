import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { searchTokens, getTokenPrice, prefilterToken, getAnomalyThreshold } from "@/lib/external/coingecko";

describe("token search API (CoinGecko)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("searchTokens", () => {
    it("returns parsed search results", async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            coins: [
              { id: "bitcoin", name: "Bitcoin", symbol: "btc", market_cap_rank: 1, thumb: "https://..." },
              { id: "pepe", name: "Pepe", symbol: "pepe", market_cap_rank: 50, thumb: "https://..." },
            ],
          }),
          { status: 200 }
        )
      );

      const results = await searchTokens("bit");
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe("Bitcoin");
    });

    it("returns empty array on API error", async () => {
      mockFetch.mockResolvedValue(new Response("", { status: 500 }));
      const results = await searchTokens("test");
      expect(results).toEqual([]);
    });

    it("returns empty array on network failure", async () => {
      mockFetch.mockRejectedValue(new Error("network"));
      const results = await searchTokens("test");
      expect(results).toEqual([]);
    });

    it("limits results to 10", async () => {
      const manyCoins = Array.from({ length: 20 }, (_, i) => ({
        id: `coin-${i}`,
        name: `Coin ${i}`,
        symbol: `C${i}`,
        market_cap_rank: i,
        thumb: "",
      }));
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ coins: manyCoins }), { status: 200 })
      );

      const results = await searchTokens("coin");
      expect(results).toHaveLength(10);
    });
  });

  describe("getTokenPrice", () => {
    it("returns price and 24h change", async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            "0xabc": { usd: 1.5, usd_24h_change: 12.5 },
          }),
          { status: 200 }
        )
      );

      const price = await getTokenPrice("0xABC", "ethereum");
      expect(price).toEqual({ usd: 1.5, usd_24h_change: 12.5 });
    });

    it("returns null for unknown chain", async () => {
      const price = await getTokenPrice("0xABC", "unknown-chain");
      expect(price).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns null on API error", async () => {
      mockFetch.mockResolvedValue(new Response("", { status: 500 }));
      const price = await getTokenPrice("0xABC", "ethereum");
      expect(price).toBeNull();
    });

    it("returns null when token not found in response", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 })
      );
      const price = await getTokenPrice("0xABC", "ethereum");
      expect(price).toBeNull();
    });

    it("handles missing usd_24h_change gracefully", async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ "0xabc": { usd: 2.0 } }),
          { status: 200 }
        )
      );
      const price = await getTokenPrice("0xABC", "ethereum");
      expect(price).toEqual({ usd: 2.0, usd_24h_change: 0 });
    });
  });

  describe("prefilterToken", () => {
    it("recommends investigation for volatile tokens", async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ "0xabc": { usd: 1.0, usd_24h_change: 25 } }),
          { status: 200 }
        )
      );

      const result = await prefilterToken("0xABC", "ethereum");
      expect(result.shouldInvestigate).toBe(true);
    });

    it("discourages investigation for low-volatility tokens", async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ "0xabc": { usd: 1.0, usd_24h_change: 0.5 } }),
          { status: 200 }
        )
      );

      const result = await prefilterToken("0xABC", "ethereum");
      expect(result.shouldInvestigate).toBe(false);
      expect(result.reason).toContain("Low recent volatility");
    });

    it("recommends investigation when token not found on CoinGecko", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 })
      );

      const result = await prefilterToken("0xNEW", "ethereum");
      expect(result.shouldInvestigate).toBe(true);
      expect(result.reason).toContain("not found on CoinGecko");
    });
  });

  describe("getAnomalyThreshold", () => {
    it("returns 15 for large-cap (>$100M)", () => {
      expect(getAnomalyThreshold(500_000_000)).toBe(15);
    });

    it("returns 25 for upper-mid-cap ($10M-$100M)", () => {
      expect(getAnomalyThreshold(50_000_000)).toBe(25);
    });

    it("returns 50 for micro-cap (<$1M)", () => {
      expect(getAnomalyThreshold(500_000)).toBe(50);
    });

    it("returns 35 when market cap is undefined", () => {
      expect(getAnomalyThreshold(undefined)).toBe(35);
    });
  });
});
