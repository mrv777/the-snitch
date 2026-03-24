import { describe, it, expect } from "vitest";
import { detectAnomaly } from "@/lib/forensics/token-investigator";
import type { TokenOhlcvRow } from "@/lib/nansen/types";

// --- Helpers ---

function makeCandle(overrides: Partial<TokenOhlcvRow> = {}): TokenOhlcvRow {
  return {
    timestamp: "2024-01-15T00:00:00Z",
    open: 1.0,
    high: 1.1,
    low: 0.95,
    close: 1.05,
    volume: 1_000_000,
    ...overrides,
  };
}

// --- Tests ---

describe("detectAnomaly", () => {
  it("returns null for empty OHLCV data", () => {
    expect(detectAnomaly([], undefined)).toBeNull();
  });

  it("returns null when no candle exceeds threshold", () => {
    // Large-cap (>$100M) → threshold 20%
    const candles = [
      makeCandle({ open: 100, close: 105 }), // +5%
      makeCandle({ open: 100, close: 95, timestamp: "2024-01-16T00:00:00Z" }), // -5%
    ];

    expect(detectAnomaly(candles, 500_000_000)).toBeNull();
  });

  it("detects pump in large-cap token (>20% threshold)", () => {
    const candles = [
      makeCandle({ open: 100, close: 130, high: 135, volume: 50_000_000 }),
    ];

    const result = detectAnomaly(candles, 500_000_000);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe("pump");
    expect(result!.priceChangePct).toBe(30);
  });

  it("detects dump in large-cap token", () => {
    const candles = [
      makeCandle({ open: 100, close: 70, low: 65 }),
    ];

    const result = detectAnomaly(candles, 500_000_000);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe("dump");
    expect(result!.priceChangePct).toBe(-30);
  });

  it("uses 50% threshold for mid-cap ($1M-$100M)", () => {
    // 40% move should NOT trigger for mid-cap
    const candles = [makeCandle({ open: 1.0, close: 1.4 })];
    expect(detectAnomaly(candles, 50_000_000)).toBeNull();

    // 60% move SHOULD trigger
    const bigCandles = [makeCandle({ open: 1.0, close: 1.6 })];
    const result = detectAnomaly(bigCandles, 50_000_000);
    expect(result).not.toBeNull();
    expect(result!.priceChangePct).toBeCloseTo(60, 5);
  });

  it("uses 100% threshold for micro-cap (<$1M)", () => {
    // 80% move should NOT trigger for micro-cap
    const candles = [makeCandle({ open: 0.001, close: 0.0018 })];
    expect(detectAnomaly(candles, 500_000)).toBeNull();

    // 150% move SHOULD trigger
    const bigCandles = [makeCandle({ open: 0.001, close: 0.0025 })];
    const result = detectAnomaly(bigCandles, 500_000);
    expect(result).not.toBeNull();
  });

  it("defaults to 50% threshold when market cap is undefined", () => {
    const candles = [makeCandle({ open: 1.0, close: 1.6 })];
    const result = detectAnomaly(candles, undefined);
    expect(result).not.toBeNull();
  });

  it("picks the most extreme anomaly when multiple exist", () => {
    const candles = [
      makeCandle({
        timestamp: "2024-01-10T00:00:00Z",
        open: 1.0,
        close: 1.3,
      }), // +30%
      makeCandle({
        timestamp: "2024-01-12T00:00:00Z",
        open: 1.3,
        close: 2.6,
      }), // +100%
      makeCandle({
        timestamp: "2024-01-14T00:00:00Z",
        open: 2.6,
        close: 3.12,
      }), // +20%
    ];

    const result = detectAnomaly(candles, 500_000_000);
    expect(result).not.toBeNull();
    expect(result!.date).toBe("2024-01-12T00:00:00Z");
    expect(result!.priceChangePct).toBe(100);
  });

  it("skips candles with zero open price", () => {
    const candles = [
      makeCandle({ open: 0, close: 100 }),
    ];

    expect(detectAnomaly(candles, undefined)).toBeNull();
  });

  it("populates all anomaly fields correctly", () => {
    const candles = [
      makeCandle({
        timestamp: "2024-01-15T00:00:00Z",
        open: 10,
        close: 25,
        high: 28,
        low: 9,
        volume: 8_000_000,
      }),
    ];

    const result = detectAnomaly(candles, 500_000_000);
    expect(result).not.toBeNull();
    expect(result!.date).toBe("2024-01-15T00:00:00Z");
    expect(result!.openPrice).toBe(10);
    expect(result!.closePrice).toBe(25);
    expect(result!.highPrice).toBe(28);
    expect(result!.lowPrice).toBe(9);
    expect(result!.volume).toBe(8_000_000);
    expect(result!.direction).toBe("pump");
    expect(result!.priceChangePct).toBe(150);
  });
});
