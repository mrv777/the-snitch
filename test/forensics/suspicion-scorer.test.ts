import { describe, it, expect } from "vitest";
import { computeSuspicionScore } from "@/lib/forensics/suspicion-scorer";
import type { Suspect, SuspectCluster } from "@/lib/forensics/types";
import type { WhoBoughtSoldRow } from "@/lib/nansen/types";

// --- Test Helpers ---

function makeSuspect(overrides: Partial<Suspect> = {}): Suspect {
  return {
    address: "0xaaaa000000000000000000000000000000000001",
    rank: 1,
    score: 100,
    timingAdvantage: 12,
    volumeUsd: 500_000,
    action: "buy",
    isDexVisible: true,
    ...overrides,
  };
}

function makeWhoBoughtSold(
  overrides: Partial<WhoBoughtSoldRow> = {}
): WhoBoughtSoldRow {
  return {
    address: "0xaaaa000000000000000000000000000000000001",
    action: "buy",
    amount: 1000,
    value_usd: 50_000,
    ...overrides,
  };
}

// --- Tests ---

describe("computeSuspicionScore", () => {
  it("returns zero score with no suspects", () => {
    const { score, evidence } = computeSuspicionScore({
      suspects: [],
      clusters: [],
      totalPreMoveVolume: 1_000_000,
      whoBoughtSold: [],
      hasConnectionData: false,
    });

    expect(score).toBe(0);
    expect(evidence).toHaveLength(5);
    evidence.forEach((e) => expect(e.subScore).toBe(0));
  });

  it("scores high for strong timing advantage (>24h)", () => {
    const suspects = [makeSuspect({ timingAdvantage: 48 })];
    const { evidence } = computeSuspicionScore({
      suspects,
      clusters: [],
      totalPreMoveVolume: 1_000_000,
      whoBoughtSold: [],
      hasConnectionData: false,
    });

    const timing = evidence.find((e) => e.factor === "timing")!;
    expect(timing.subScore).toBe(100);
  });

  it("scores 80 for 6-24h timing advantage", () => {
    const suspects = [makeSuspect({ timingAdvantage: 12 })];
    const { evidence } = computeSuspicionScore({
      suspects,
      clusters: [],
      totalPreMoveVolume: 1_000_000,
      whoBoughtSold: [],
      hasConnectionData: false,
    });

    const timing = evidence.find((e) => e.factor === "timing")!;
    expect(timing.subScore).toBe(80);
  });

  it("scores 60 for 1-6h timing advantage", () => {
    const suspects = [makeSuspect({ timingAdvantage: 3 })];
    const { evidence } = computeSuspicionScore({
      suspects,
      clusters: [],
      totalPreMoveVolume: 1_000_000,
      whoBoughtSold: [],
      hasConnectionData: false,
    });

    const timing = evidence.find((e) => e.factor === "timing")!;
    expect(timing.subScore).toBe(60);
  });

  it("scores 40 for <1h timing advantage", () => {
    const suspects = [makeSuspect({ timingAdvantage: 0.5 })];
    const { evidence } = computeSuspicionScore({
      suspects,
      clusters: [],
      totalPreMoveVolume: 1_000_000,
      whoBoughtSold: [],
      hasConnectionData: false,
    });

    const timing = evidence.find((e) => e.factor === "timing")!;
    expect(timing.subScore).toBe(40);
  });

  it("scores volume concentration based on % of pre-move volume", () => {
    // 3 suspects with 600K out of 1M total = 60% → score 100
    const suspects = [
      makeSuspect({ rank: 1, volumeUsd: 300_000 }),
      makeSuspect({ rank: 2, volumeUsd: 200_000, address: "0xbbbb000000000000000000000000000000000002" }),
      makeSuspect({ rank: 3, volumeUsd: 100_000, address: "0xcccc000000000000000000000000000000000003" }),
    ];

    const { evidence } = computeSuspicionScore({
      suspects,
      clusters: [],
      totalPreMoveVolume: 1_000_000,
      whoBoughtSold: [],
      hasConnectionData: false,
    });

    const volume = evidence.find((e) => e.factor === "volume_concentration")!;
    expect(volume.subScore).toBe(100); // 60% > 50%
  });

  it("scores volume concentration 70 for 30-50%", () => {
    const suspects = [makeSuspect({ volumeUsd: 400_000 })];
    const { evidence } = computeSuspicionScore({
      suspects,
      clusters: [],
      totalPreMoveVolume: 1_000_000,
      whoBoughtSold: [],
      hasConnectionData: false,
    });

    const volume = evidence.find((e) => e.factor === "volume_concentration")!;
    expect(volume.subScore).toBe(70); // 40% → 30-50% band
  });

  it("scores wallet connections 100 for same funding source", () => {
    const s1 = makeSuspect({ rank: 1 });
    const s2 = makeSuspect({ rank: 2, address: "0xbbbb000000000000000000000000000000000002" });
    const clusters: SuspectCluster[] = [
      {
        suspects: [s1, s2],
        connectionType: "same_funding",
        description: "Both trace to same source",
      },
    ];

    const { evidence } = computeSuspicionScore({
      suspects: [s1, s2],
      clusters,
      totalPreMoveVolume: 1_000_000,
      whoBoughtSold: [],
      hasConnectionData: true,
    });

    const connections = evidence.find((e) => e.factor === "wallet_connections")!;
    expect(connections.subScore).toBe(100);
  });

  it("scores wallet connections 70 for shared counterparties", () => {
    const s1 = makeSuspect({ rank: 1 });
    const s2 = makeSuspect({ rank: 2, address: "0xbbbb000000000000000000000000000000000002" });
    const clusters: SuspectCluster[] = [
      {
        suspects: [s1, s2],
        connectionType: "shared_counterparties",
        description: "Share counterparties",
      },
    ];

    const { evidence } = computeSuspicionScore({
      suspects: [s1, s2],
      clusters,
      totalPreMoveVolume: 1_000_000,
      whoBoughtSold: [],
      hasConnectionData: true,
    });

    const connections = evidence.find((e) => e.factor === "wallet_connections")!;
    expect(connections.subScore).toBe(70);
  });

  it("scores smart money labels 100 for known fund", () => {
    const suspects = [
      makeSuspect({ entityName: "Paradigm Capital Fund" }),
    ];
    const wbs = [
      makeWhoBoughtSold({ entity_name: "Paradigm Capital Fund" }),
      makeWhoBoughtSold({ entity_name: "Some Trader", address: "0xbbbb000000000000000000000000000000000002" }),
    ];

    const { evidence } = computeSuspicionScore({
      suspects,
      clusters: [],
      totalPreMoveVolume: 1_000_000,
      whoBoughtSold: wbs,
      hasConnectionData: false,
    });

    const labels = evidence.find((e) => e.factor === "smart_money_labels")!;
    expect(labels.subScore).toBe(100);
  });

  it("scores smart money labels 20 for unlabeled suspects", () => {
    const suspects = [makeSuspect({ entityName: undefined, label: undefined })];
    const wbs = [
      makeWhoBoughtSold({ entity_name: "Labeled Entity" }),
      makeWhoBoughtSold({ entity_name: "Another One", address: "0xbbbb000000000000000000000000000000000002" }),
    ];

    const { evidence } = computeSuspicionScore({
      suspects,
      clusters: [],
      totalPreMoveVolume: 1_000_000,
      whoBoughtSold: wbs,
      hasConnectionData: false,
    });

    const labels = evidence.find((e) => e.factor === "smart_money_labels")!;
    expect(labels.subScore).toBe(20);
  });

  it("reweights when labels are sparse (<10% labeled)", () => {
    const suspects = [makeSuspect({ timingAdvantage: 48 })];
    // 10 entries, 0 labeled → sparse
    const wbs = Array.from({ length: 10 }, (_, i) =>
      makeWhoBoughtSold({
        address: `0x${String(i).padStart(40, "0")}`,
        entity_name: undefined,
        label: undefined,
      })
    );

    const { evidence } = computeSuspicionScore({
      suspects,
      clusters: [],
      totalPreMoveVolume: 1_000_000,
      whoBoughtSold: wbs,
      hasConnectionData: false,
    });

    // When sparse, timing weight should be 0.35 instead of 0.30
    const timing = evidence.find((e) => e.factor === "timing")!;
    expect(timing.weight).toBe(0.35);

    // And smart_money_labels weight should be 0.05 instead of 0.15
    const labels = evidence.find((e) => e.factor === "smart_money_labels")!;
    expect(labels.weight).toBe(0.05);
  });

  it("scores profit magnitude 100 for >10x returns", () => {
    const suspects = [makeSuspect({ pnlUsd: 500_000, pnlPercent: 1500 })];
    const { evidence } = computeSuspicionScore({
      suspects,
      clusters: [],
      totalPreMoveVolume: 1_000_000,
      whoBoughtSold: [],
      hasConnectionData: false,
    });

    const profit = evidence.find((e) => e.factor === "profit_magnitude")!;
    expect(profit.subScore).toBe(100);
  });

  it("scores profit magnitude 40 for 2-5x returns", () => {
    const suspects = [makeSuspect({ pnlUsd: 100_000, pnlPercent: 300 })];
    const { evidence } = computeSuspicionScore({
      suspects,
      clusters: [],
      totalPreMoveVolume: 1_000_000,
      whoBoughtSold: [],
      hasConnectionData: false,
    });

    const profit = evidence.find((e) => e.factor === "profit_magnitude")!;
    expect(profit.subScore).toBe(40);
  });

  it("produces HIGHLY_SUSPICIOUS total for maximum evidence", () => {
    const s1 = makeSuspect({
      rank: 1,
      timingAdvantage: 48,
      volumeUsd: 800_000,
      pnlUsd: 2_000_000,
      pnlPercent: 2000,
      entityName: "Shadowy Fund Capital",
    });
    const s2 = makeSuspect({
      rank: 2,
      address: "0xbbbb000000000000000000000000000000000002",
      timingAdvantage: 24,
      volumeUsd: 300_000,
    });
    const clusters: SuspectCluster[] = [
      {
        suspects: [s1, s2],
        connectionType: "same_funding",
        description: "Same source",
      },
    ];
    const wbs = [
      makeWhoBoughtSold({ entity_name: "Shadowy Fund Capital" }),
      makeWhoBoughtSold({ entity_name: "Trader X", address: "0xbbbb000000000000000000000000000000000002" }),
    ];

    const { score } = computeSuspicionScore({
      suspects: [s1, s2],
      clusters,
      totalPreMoveVolume: 1_000_000,
      whoBoughtSold: wbs,
      hasConnectionData: true,
    });

    expect(score).toBeGreaterThanOrEqual(80);
  });

  it("clamps score between 0 and 100", () => {
    const { score } = computeSuspicionScore({
      suspects: [],
      clusters: [],
      totalPreMoveVolume: 0,
      whoBoughtSold: [],
      hasConnectionData: false,
    });

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("always returns exactly 5 evidence items", () => {
    const { evidence } = computeSuspicionScore({
      suspects: [makeSuspect()],
      clusters: [],
      totalPreMoveVolume: 1_000_000,
      whoBoughtSold: [],
      hasConnectionData: true,
    });

    expect(evidence).toHaveLength(5);
    const factors = evidence.map((e) => e.factor);
    expect(factors).toContain("timing");
    expect(factors).toContain("volume_concentration");
    expect(factors).toContain("wallet_connections");
    expect(factors).toContain("smart_money_labels");
    expect(factors).toContain("profit_magnitude");
  });
});
