import { describe, it, expect } from "vitest";
import { getAnomalyThreshold } from "@/lib/external/coingecko";

describe("getAnomalyThreshold", () => {
  it("returns 20% for large-cap (>$100M)", () => {
    expect(getAnomalyThreshold(500_000_000)).toBe(20);
    expect(getAnomalyThreshold(100_000_001)).toBe(20);
  });

  it("returns 50% for mid-cap ($1M-$100M)", () => {
    expect(getAnomalyThreshold(50_000_000)).toBe(50);
    expect(getAnomalyThreshold(1_000_001)).toBe(50);
  });

  it("returns 100% for micro-cap (<$1M)", () => {
    expect(getAnomalyThreshold(500_000)).toBe(100);
    expect(getAnomalyThreshold(1)).toBe(100);
  });

  it("returns 50% as default when market cap is undefined", () => {
    expect(getAnomalyThreshold(undefined)).toBe(50);
  });

  it("returns 50% for exactly $100M (boundary)", () => {
    expect(getAnomalyThreshold(100_000_000)).toBe(50);
  });

  it("returns 100% for exactly $1M (boundary)", () => {
    expect(getAnomalyThreshold(1_000_000)).toBe(100);
  });
});
