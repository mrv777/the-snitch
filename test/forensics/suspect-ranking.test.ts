import { describe, it, expect } from "vitest";
import { rankSuspects } from "@/lib/forensics/token-investigator";
import type { AnomalyWindow } from "@/lib/forensics/types";
import type {
  WhoBoughtSoldRow,
  DexTradeRow,
  FlowIntelligenceRow,
  SmartMoneyDexTradeRow,
} from "@/lib/nansen/types";

// --- Fixtures ---

const TOKEN = "0xtoken0000000000000000000000000000000000";
const ANOMALY_TS = Math.floor(
  new Date("2024-01-15T12:00:00Z").getTime() / 1000
);

const anomaly: AnomalyWindow = {
  date: "2024-01-15T00:00:00Z",
  timestamp: ANOMALY_TS,
  priceChangePct: 80,
  direction: "pump",
  openPrice: 1.0,
  closePrice: 1.8,
  highPrice: 2.0,
  lowPrice: 0.95,
  volume: 5_000_000,
};

const ADDR_A = "0xaaaa000000000000000000000000000000000001";
const ADDR_B = "0xbbbb000000000000000000000000000000000002";
const ADDR_C = "0xcccc000000000000000000000000000000000003";

// --- Tests ---

describe("rankSuspects", () => {
  it("returns empty array when no data", () => {
    const result = rankSuspects([], [], [], [], anomaly, TOKEN);
    expect(result).toHaveLength(0);
  });

  it("ranks suspects by timing × volume score", () => {
    const dexTrades: DexTradeRow[] = [
      {
        maker_address: "0xcounterparty0000000000000000000000000000",
        taker_address: ADDR_A,
        token_bought: TOKEN,
        token_sold: "0xusdc",
        amount_usd: 100_000,
        block_timestamp: "2024-01-15T00:00:00Z", // T-12h
        transaction_hash: "0xtx1",
      },
      {
        maker_address: "0xcounterparty0000000000000000000000000000",
        taker_address: ADDR_B,
        token_bought: TOKEN,
        token_sold: "0xusdc",
        amount_usd: 500_000,
        block_timestamp: "2024-01-15T11:00:00Z", // T-1h
        transaction_hash: "0xtx2",
      },
    ];

    const result = rankSuspects([], dexTrades, [], [], anomaly, TOKEN);

    expect(result.length).toBeGreaterThanOrEqual(2);
    // ADDR_A has 12h advantage × log10(100K) ≈ 12 × 5 = 60
    // ADDR_B has 1h advantage × log10(500K) ≈ 1 × 5.7 = 5.7
    // ADDR_A should rank higher due to timing advantage
    expect(result[0].address).toBe(ADDR_A.toLowerCase());
  });

  it("applies 1.5x multiplier for DEX-visible addresses", () => {
    const dexTrades: DexTradeRow[] = [
      {
        maker_address: "0xcounterparty",
        taker_address: ADDR_A,
        token_bought: TOKEN,
        token_sold: "0xusdc",
        amount_usd: 100_000,
        block_timestamp: "2024-01-15T06:00:00Z", // T-6h
        transaction_hash: "0xtx1",
      },
    ];

    const result = rankSuspects([], dexTrades, [], [], anomaly, TOKEN);

    expect(result[0].isDexVisible).toBe(true);
  });

  it("merges addresses from who-bought-sold and dex-trades", () => {
    const wbs: WhoBoughtSoldRow[] = [
      {
        address: ADDR_A,
        entity_name: "Known Whale",
        action: "buy",
        amount: 50_000,
        value_usd: 50_000,
      },
    ];

    const dexTrades: DexTradeRow[] = [
      {
        maker_address: "0xcounterparty",
        taker_address: ADDR_A, // same address as wbs
        token_bought: TOKEN,
        token_sold: "0xusdc",
        amount_usd: 100_000,
        block_timestamp: "2024-01-15T06:00:00Z",
        transaction_hash: "0xtx1",
      },
    ];

    const result = rankSuspects(wbs, dexTrades, [], [], anomaly, TOKEN);

    expect(result).toHaveLength(1);
    // Volume should be merged: 50K + 100K = 150K
    expect(result[0].volumeUsd).toBe(150_000);
    expect(result[0].entityName).toBe("Known Whale");
  });

  it("limits to top 3 suspects", () => {
    const dexTrades: DexTradeRow[] = [ADDR_A, ADDR_B, ADDR_C, "0xdddd000000000000000000000000000000000004"].map(
      (addr, i) => ({
        maker_address: "0xcounterparty",
        taker_address: addr,
        token_bought: TOKEN,
        token_sold: "0xusdc",
        amount_usd: (4 - i) * 100_000,
        block_timestamp: new Date(
          (ANOMALY_TS - (i + 1) * 3600) * 1000
        ).toISOString(),
        transaction_hash: `0xtx${i}`,
      })
    );

    const result = rankSuspects([], dexTrades, [], [], anomaly, TOKEN);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("assigns correct ranks", () => {
    const dexTrades: DexTradeRow[] = [
      {
        maker_address: "0xcounterparty",
        taker_address: ADDR_A,
        token_bought: TOKEN,
        token_sold: "0xusdc",
        amount_usd: 300_000,
        block_timestamp: "2024-01-15T00:00:00Z",
        transaction_hash: "0xtx1",
      },
      {
        maker_address: "0xcounterparty",
        taker_address: ADDR_B,
        token_bought: TOKEN,
        token_sold: "0xusdc",
        amount_usd: 100_000,
        block_timestamp: "2024-01-15T06:00:00Z",
        transaction_hash: "0xtx2",
      },
    ];

    const result = rankSuspects([], dexTrades, [], [], anomaly, TOKEN);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
  });

  it("picks up smart money trades for the target token", () => {
    const smTrades: SmartMoneyDexTradeRow[] = [
      {
        address: ADDR_A,
        entity_name: "Smart Money Alpha",
        token_address: TOKEN,
        token_symbol: "TOKEN",
        action: "buy",
        amount_usd: 200_000,
        block_timestamp: "2024-01-15T06:00:00Z",
      },
    ];

    const result = rankSuspects([], [], [], smTrades, anomaly, TOKEN);
    expect(result).toHaveLength(1);
    expect(result[0].entityName).toBe("Smart Money Alpha");
    expect(result[0].isDexVisible).toBe(true);
  });

  it("ignores smart money trades for other tokens", () => {
    const smTrades: SmartMoneyDexTradeRow[] = [
      {
        address: ADDR_A,
        token_address: "0xothertoken",
        token_symbol: "OTHER",
        action: "buy",
        amount_usd: 200_000,
        block_timestamp: "2024-01-15T06:00:00Z",
      },
    ];

    const result = rankSuspects([], [], [], smTrades, anomaly, TOKEN);
    expect(result).toHaveLength(0);
  });

  it("filters out addresses with zero score (no timing advantage)", () => {
    const wbs: WhoBoughtSoldRow[] = [
      {
        address: ADDR_A,
        action: "buy",
        amount: 100,
        value_usd: 100,
        // No dex-trades entry → no timing data → timingAdvantage stays 0
      },
    ];

    const result = rankSuspects(wbs, [], [], [], anomaly, TOKEN);
    // Address has volume from wbs but no timing data from dex-trades
    // score = 0 * log10(100) * 1.0 = 0 → filtered out
    expect(result).toHaveLength(0);
  });

  it("detects both buy and sell actions", () => {
    const dexTrades: DexTradeRow[] = [
      {
        maker_address: "0xcounterparty",
        taker_address: ADDR_A,
        token_bought: TOKEN,
        token_sold: "0xusdc",
        amount_usd: 100_000,
        block_timestamp: "2024-01-15T06:00:00Z",
        transaction_hash: "0xtx1",
      },
      {
        maker_address: ADDR_A, // selling
        taker_address: "0xcounterparty",
        token_bought: "0xusdc",
        token_sold: TOKEN,
        amount_usd: 150_000,
        block_timestamp: "2024-01-15T14:00:00Z", // after anomaly
        transaction_hash: "0xtx2",
      },
    ];

    const result = rankSuspects([], dexTrades, [], [], anomaly, TOKEN);
    expect(result[0].action).toBe("both");
  });
});
