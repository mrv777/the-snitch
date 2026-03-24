import { describe, it, expect } from "vitest";
import { buildTimeline } from "@/lib/forensics/timeline-builder";
import type { AnomalyWindow, Suspect } from "@/lib/forensics/types";
import type { DexTradeRow, SmartMoneyDexTradeRow } from "@/lib/nansen/types";

// --- Fixtures ---

const TOKEN_ADDRESS = "0xtoken0000000000000000000000000000000000";

// Anomaly at 2024-01-15 12:00:00 UTC
const ANOMALY_TS = Math.floor(
  new Date("2024-01-15T12:00:00Z").getTime() / 1000
);

const anomaly: AnomalyWindow = {
  date: "2024-01-15T00:00:00Z",
  timestamp: ANOMALY_TS,
  priceChangePct: 85,
  direction: "pump",
  openPrice: 1.0,
  closePrice: 1.85,
  highPrice: 2.1,
  lowPrice: 0.95,
  volume: 5_000_000,
};

const SUSPECT_1 = "0xsuspect100000000000000000000000000000001";
const SUSPECT_2 = "0xsuspect200000000000000000000000000000002";

const suspects: Suspect[] = [
  {
    address: SUSPECT_1,
    entityName: "Whale Alpha",
    rank: 1,
    score: 200,
    timingAdvantage: 6,
    volumeUsd: 500_000,
    action: "buy",
    isDexVisible: true,
  },
  {
    address: SUSPECT_2,
    rank: 2,
    score: 100,
    timingAdvantage: 3,
    volumeUsd: 200_000,
    action: "buy",
    isDexVisible: true,
  },
];

function makeDexTrade(overrides: Partial<DexTradeRow> = {}): DexTradeRow {
  return {
    maker_address: "0xcounterparty0000000000000000000000000000",
    taker_address: SUSPECT_1,
    taker_name: "Whale Alpha",
    token_bought: TOKEN_ADDRESS,
    token_sold: "0xusdc00000000000000000000000000000000000",
    amount_usd: 100_000,
    block_timestamp: "2024-01-15T06:00:00Z", // T-6h
    transaction_hash: "0xtx1",
    dex_name: "Uniswap",
    ...overrides,
  };
}

function makeSmartMoneyTrade(
  overrides: Partial<SmartMoneyDexTradeRow> = {}
): SmartMoneyDexTradeRow {
  return {
    address: "0xsmartmoney000000000000000000000000000000",
    entity_name: "Smart Money Fund",
    token_address: TOKEN_ADDRESS,
    token_symbol: "TOKEN",
    action: "buy",
    amount_usd: 250_000,
    block_timestamp: "2024-01-15T08:00:00Z", // T-4h
    ...overrides,
  };
}

// --- Tests ---

describe("buildTimeline", () => {
  it("always includes the price_move event", () => {
    const events = buildTimeline({
      anomaly,
      suspects: [],
      dexTrades: [],
      smartMoneyTrades: [],
      tokenAddress: TOKEN_ADDRESS,
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("price_move");
    expect(events[0].relativeLabel).toBe("T-0");
    expect(events[0].description).toContain("85.0%");
  });

  it("includes suspect buy from dex-trades with correct relative time", () => {
    const dexTrades = [makeDexTrade()]; // T-6h

    const events = buildTimeline({
      anomaly,
      suspects,
      dexTrades,
      smartMoneyTrades: [],
      tokenAddress: TOKEN_ADDRESS,
    });

    const suspectBuys = events.filter((e) => e.type === "suspect_buy");
    expect(suspectBuys).toHaveLength(1);
    expect(suspectBuys[0].relativeLabel).toBe("T-6h");
    expect(suspectBuys[0].actor).toBe("Whale Alpha");
    expect(suspectBuys[0].volumeUsd).toBe(100_000);
  });

  it("includes suspect sell events", () => {
    const dexTrades = [
      makeDexTrade({
        maker_address: SUSPECT_1,
        token_bought: "0xusdc00000000000000000000000000000000000",
        token_sold: TOKEN_ADDRESS,
        block_timestamp: "2024-01-15T14:00:00Z", // T+2h
      }),
    ];

    const events = buildTimeline({
      anomaly,
      suspects,
      dexTrades,
      smartMoneyTrades: [],
      tokenAddress: TOKEN_ADDRESS,
    });

    const sells = events.filter((e) => e.type === "suspect_sell");
    expect(sells).toHaveLength(1);
    expect(sells[0].relativeLabel).toBe("T+2h");
  });

  it("includes smart money activity for the target token", () => {
    const events = buildTimeline({
      anomaly,
      suspects,
      dexTrades: [],
      smartMoneyTrades: [makeSmartMoneyTrade()],
      tokenAddress: TOKEN_ADDRESS,
    });

    const smEvents = events.filter((e) => e.type === "smart_money_activity");
    expect(smEvents).toHaveLength(1);
    expect(smEvents[0].actor).toBe("Smart Money Fund");
    expect(smEvents[0].relativeLabel).toBe("T-4h");
  });

  it("excludes smart money trades for other tokens", () => {
    const events = buildTimeline({
      anomaly,
      suspects,
      dexTrades: [],
      smartMoneyTrades: [
        makeSmartMoneyTrade({
          token_address: "0xothertoken000000000000000000000000000000",
        }),
      ],
      tokenAddress: TOKEN_ADDRESS,
    });

    const smEvents = events.filter((e) => e.type === "smart_money_activity");
    expect(smEvents).toHaveLength(0);
  });

  it("does not duplicate suspect as smart money", () => {
    // Smart money trade from the same address as a suspect
    const events = buildTimeline({
      anomaly,
      suspects,
      dexTrades: [],
      smartMoneyTrades: [
        makeSmartMoneyTrade({ address: SUSPECT_1 }),
      ],
      tokenAddress: TOKEN_ADDRESS,
    });

    const smEvents = events.filter((e) => e.type === "smart_money_activity");
    expect(smEvents).toHaveLength(0); // should be filtered out
  });

  it("sorts events by timestamp", () => {
    const dexTrades = [
      makeDexTrade({ block_timestamp: "2024-01-15T06:00:00Z" }), // T-6h
      makeDexTrade({
        maker_address: SUSPECT_2,
        block_timestamp: "2024-01-15T09:00:00Z", // T-3h
        transaction_hash: "0xtx2",
      }),
    ];

    const events = buildTimeline({
      anomaly,
      suspects,
      dexTrades,
      smartMoneyTrades: [makeSmartMoneyTrade()], // T-4h
      tokenAddress: TOKEN_ADDRESS,
    });

    // Should be: T-6h, T-4h, T-3h, T-0
    for (let i = 1; i < events.length; i++) {
      expect(events[i].timestamp).toBeGreaterThanOrEqual(
        events[i - 1].timestamp
      );
    }
  });

  it("deduplicates events with same timestamp + actor + type", () => {
    const dexTrades = [
      makeDexTrade({ transaction_hash: "0xtx1" }),
      makeDexTrade({ transaction_hash: "0xtx2" }), // same actor, same time, same type
    ];

    const events = buildTimeline({
      anomaly,
      suspects,
      dexTrades,
      smartMoneyTrades: [],
      tokenAddress: TOKEN_ADDRESS,
    });

    const suspectBuys = events.filter((e) => e.type === "suspect_buy");
    expect(suspectBuys).toHaveLength(1);
  });

  it("skips trades with invalid timestamps", () => {
    const dexTrades = [
      makeDexTrade({ block_timestamp: "not-a-date" }),
    ];

    const events = buildTimeline({
      anomaly,
      suspects,
      dexTrades,
      smartMoneyTrades: [],
      tokenAddress: TOKEN_ADDRESS,
    });

    // Only the price_move event
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("price_move");
  });

  it("labels pump direction correctly", () => {
    const events = buildTimeline({
      anomaly,
      suspects: [],
      dexTrades: [],
      smartMoneyTrades: [],
      tokenAddress: TOKEN_ADDRESS,
    });

    expect(events[0].description).toContain("surged");
  });

  it("labels dump direction correctly", () => {
    const dumpAnomaly: AnomalyWindow = {
      ...anomaly,
      priceChangePct: -60,
      direction: "dump",
    };

    const events = buildTimeline({
      anomaly: dumpAnomaly,
      suspects: [],
      dexTrades: [],
      smartMoneyTrades: [],
      tokenAddress: TOKEN_ADDRESS,
    });

    expect(events[0].description).toContain("crashed");
  });
});
