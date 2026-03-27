import { describe, it, expect } from "vitest";
import { getAnomalyThreshold } from "@/lib/external/coingecko";

describe("getAnomalyThreshold", () => {
  it("returns 15% for large-cap (>$100M)", () => {
    expect(getAnomalyThreshold(500_000_000)).toBe(15);
    expect(getAnomalyThreshold(100_000_001)).toBe(15);
  });

  it("returns 25% for upper-mid-cap ($10M-$100M)", () => {
    expect(getAnomalyThreshold(50_000_000)).toBe(25);
    expect(getAnomalyThreshold(10_000_001)).toBe(25);
  });

  it("returns 35% for lower-mid-cap ($1M-$10M)", () => {
    expect(getAnomalyThreshold(5_000_000)).toBe(35);
    expect(getAnomalyThreshold(1_000_001)).toBe(35);
  });

  it("returns 50% for micro-cap (<$1M)", () => {
    expect(getAnomalyThreshold(500_000)).toBe(50);
    expect(getAnomalyThreshold(1)).toBe(50);
  });

  it("returns 35% as default when market cap is undefined", () => {
    expect(getAnomalyThreshold(undefined)).toBe(35);
  });

  it("returns 25% for exactly $100M (boundary)", () => {
    expect(getAnomalyThreshold(100_000_000)).toBe(25);
  });

  it("returns 50% for exactly $1M (boundary)", () => {
    expect(getAnomalyThreshold(1_000_000)).toBe(50);
  });
});
