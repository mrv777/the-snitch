import { describe, it, expect } from "vitest";
import { computeInsiderScore } from "@/lib/forensics/insider-scorer";
import type { Suspect, SuspectCluster } from "@/lib/forensics/types";
import type { PmPnlByMarketRow } from "@/lib/nansen/types";

// --- Test Helpers ---

function makeProfiter(overrides: Partial<Suspect> = {}): Suspect {
  return {
    address: "0xaaaa000000000000000000000000000000000001",
    rank: 1,
    score: 100_000,
    timingAdvantage: 336, // 14 days in hours
    volumeUsd: 150_000,
    action: "buy",
    isDexVisible: false,
    pnlUsd: 180_000,
    pnlPercent: 120,
    winRate: 72,
    ...overrides,
  };
}

function makePnlRow(overrides: Partial<PmPnlByMarketRow> = {}): PmPnlByMarketRow {
  return {
    address: "0xaaaa000000000000000000000000000000000001",
    realized_pnl_usd: 100_000,
    ...overrides,
  };
}

// --- Tests ---

describe("computeInsiderScore", () => {
  it("returns zero score with no profiters", () => {
    const { score, evidence } = computeInsiderScore({
      profiters: [],
      clusters: [],
      totalMarketPnl: 1_000_000,
      pnlByMarket: [],
      hasConnectionData: false,
    });

    expect(score).toBe(0);
    expect(evidence).toHaveLength(5);
    evidence.forEach((e) => expect(e.subScore).toBe(0));
  });

  it("returns 5 evidence items (PM-specific factors)", () => {
    const { evidence } = computeInsiderScore({
      profiters: [makeProfiter()],
      clusters: [],
      totalMarketPnl: 1_000_000,
      pnlByMarket: [makePnlRow()],
      hasConnectionData: false,
    });

    expect(evidence).toHaveLength(5);
    const factors = evidence.map((e) => e.factor);
    expect(factors).toContain("position_timing");
    expect(factors).toContain("profit_magnitude");
    expect(factors).toContain("profit_concentration");
    expect(factors).toContain("wallet_connections");
    expect(factors).toContain("track_record");
  });

  it("scores position timing 100 for >7 days early entry", () => {
    const profiters = [makeProfiter({ timingAdvantage: 504 })]; // 21 days

    const { evidence } = computeInsiderScore({
      profiters,
      clusters: [],
      totalMarketPnl: 1_000_000,
      pnlByMarket: [],
      hasConnectionData: false,
    });

    const timing = evidence.find((e) => e.factor === "position_timing")!;
    expect(timing.subScore).toBe(100);
  });

  it("scores position timing 80 for 3-7 days early entry", () => {
    const profiters = [makeProfiter({ timingAdvantage: 120 })]; // 5 days

    const { evidence } = computeInsiderScore({
      profiters,
      clusters: [],
      totalMarketPnl: 1_000_000,
      pnlByMarket: [],
      hasConnectionData: false,
    });

    const timing = evidence.find((e) => e.factor === "position_timing")!;
    expect(timing.subScore).toBe(80);
  });

  it("scores position timing 60 for 1-3 days early entry", () => {
    const profiters = [makeProfiter({ timingAdvantage: 48 })]; // 2 days

    const { evidence } = computeInsiderScore({
      profiters,
      clusters: [],
      totalMarketPnl: 1_000_000,
      pnlByMarket: [],
      hasConnectionData: false,
    });

    const timing = evidence.find((e) => e.factor === "position_timing")!;
    expect(timing.subScore).toBe(60);
  });

  it("scores position timing 40 for <1 day early entry", () => {
    const profiters = [makeProfiter({ timingAdvantage: 6 })]; // 6 hours

    const { evidence } = computeInsiderScore({
      profiters,
      clusters: [],
      totalMarketPnl: 1_000_000,
      pnlByMarket: [],
      hasConnectionData: false,
    });

    const timing = evidence.find((e) => e.factor === "position_timing")!;
    expect(timing.subScore).toBe(40);
  });

  it("scores profit magnitude 100 for >$500K profit", () => {
    const profiters = [makeProfiter({ pnlUsd: 600_000 })];

    const { evidence } = computeInsiderScore({
      profiters,
      clusters: [],
      totalMarketPnl: 1_000_000,
      pnlByMarket: [],
      hasConnectionData: false,
    });

    const profit = evidence.find((e) => e.factor === "profit_magnitude")!;
    expect(profit.subScore).toBe(100);
  });

  it("scores profit magnitude 80 for $100K-$500K profit", () => {
    const profiters = [makeProfiter({ pnlUsd: 200_000 })];

    const { evidence } = computeInsiderScore({
      profiters,
      clusters: [],
      totalMarketPnl: 1_000_000,
      pnlByMarket: [],
      hasConnectionData: false,
    });

    const profit = evidence.find((e) => e.factor === "profit_magnitude")!;
    expect(profit.subScore).toBe(80);
  });

  it("scores profit magnitude 40 for $10K-$50K profit", () => {
    const profiters = [makeProfiter({ pnlUsd: 30_000 })];

    const { evidence } = computeInsiderScore({
      profiters,
      clusters: [],
      totalMarketPnl: 1_000_000,
      pnlByMarket: [],
      hasConnectionData: false,
    });

    const profit = evidence.find((e) => e.factor === "profit_magnitude")!;
    expect(profit.subScore).toBe(40);
  });

  it("scores profit concentration 100 for >50% of market PnL", () => {
    const profiters = [
      makeProfiter({ rank: 1, pnlUsd: 400_000 }),
      makeProfiter({
        rank: 2,
        pnlUsd: 200_000,
        address: "0xbbbb000000000000000000000000000000000002",
      }),
    ];

    const { evidence } = computeInsiderScore({
      profiters,
      clusters: [],
      totalMarketPnl: 1_000_000,
      pnlByMarket: [],
      hasConnectionData: false,
    });

    const conc = evidence.find((e) => e.factor === "profit_concentration")!;
    expect(conc.subScore).toBe(100); // 600K / 1M = 60%
  });

  it("scores profit concentration 70 for 30-50%", () => {
    const profiters = [makeProfiter({ pnlUsd: 350_000 })];

    const { evidence } = computeInsiderScore({
      profiters,
      clusters: [],
      totalMarketPnl: 1_000_000,
      pnlByMarket: [],
      hasConnectionData: false,
    });

    const conc = evidence.find((e) => e.factor === "profit_concentration")!;
    expect(conc.subScore).toBe(70); // 350K / 1M = 35%
  });

  it("scores wallet connections 50 for related wallets", () => {
    const p1 = makeProfiter({ rank: 1 });
    const p2 = makeProfiter({
      rank: 2,
      address: "0xbbbb000000000000000000000000000000000002",
    });
    const clusters: SuspectCluster[] = [
      {
        suspects: [p1, p2],
        connectionType: "related_wallets",
        description: "Related wallets",
      },
    ];

    const { evidence } = computeInsiderScore({
      profiters: [p1, p2],
      clusters,
      totalMarketPnl: 1_000_000,
      pnlByMarket: [],
      hasConnectionData: true,
    });

    const conn = evidence.find((e) => e.factor === "wallet_connections")!;
    expect(conn.subScore).toBe(50);
  });

  it("scores track record 100 for >90% win rate", () => {
    const profiters = [makeProfiter({ winRate: 95 })];

    const { evidence } = computeInsiderScore({
      profiters,
      clusters: [],
      totalMarketPnl: 1_000_000,
      pnlByMarket: [],
      hasConnectionData: false,
    });

    const track = evidence.find((e) => e.factor === "track_record")!;
    expect(track.subScore).toBe(100);
  });

  it("scores track record 70 for 80-90% win rate", () => {
    const profiters = [makeProfiter({ winRate: 85 })];

    const { evidence } = computeInsiderScore({
      profiters,
      clusters: [],
      totalMarketPnl: 1_000_000,
      pnlByMarket: [],
      hasConnectionData: false,
    });

    const track = evidence.find((e) => e.factor === "track_record")!;
    expect(track.subScore).toBe(70);
  });

  it("produces high insider score for strong combined evidence", () => {
    const p1 = makeProfiter({
      rank: 1,
      timingAdvantage: 504, // 21 days
      pnlUsd: 600_000,
      winRate: 92,
    });
    const p2 = makeProfiter({
      rank: 2,
      address: "0xbbbb000000000000000000000000000000000002",
      timingAdvantage: 336,
      pnlUsd: 300_000,
      winRate: 88,
    });
    const clusters: SuspectCluster[] = [
      {
        suspects: [p1, p2],
        connectionType: "related_wallets",
        description: "Related wallets",
      },
    ];

    const { score } = computeInsiderScore({
      profiters: [p1, p2],
      clusters,
      totalMarketPnl: 1_000_000,
      pnlByMarket: [],
      hasConnectionData: true,
    });

    expect(score).toBeGreaterThanOrEqual(70);
  });

  it("clamps score between 0 and 100", () => {
    const { score } = computeInsiderScore({
      profiters: [],
      clusters: [],
      totalMarketPnl: 0,
      pnlByMarket: [],
      hasConnectionData: false,
    });

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("weights sum to 1.0", () => {
    const { evidence } = computeInsiderScore({
      profiters: [makeProfiter()],
      clusters: [],
      totalMarketPnl: 1_000_000,
      pnlByMarket: [],
      hasConnectionData: false,
    });

    const totalWeight = evidence.reduce((sum, e) => sum + e.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });
});
