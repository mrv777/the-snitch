import { describe, it, expect } from "vitest";
import {
  rankProfiters,
  enrichProfiters,
  buildPmClusters,
} from "@/lib/forensics/prediction-investigator";
import type { Suspect } from "@/lib/forensics/types";
import type {
  PmPnlByMarketRow,
  PmTopHolderRow,
  PmTradeRow,
  PnlSummaryResponse,
  RelatedWalletRow,
} from "@/lib/nansen/types";
import {
  MOCK_PNL_BY_MARKET,
  MOCK_TOP_HOLDERS,
  MOCK_ALPHA_FUND_TRADES,
  MOCK_SECOND_PROFITER_TRADES,
  MOCK_ALPHA_FUND_PNL,
  MOCK_SECOND_PROFITER_PNL,
  MOCK_ALPHA_FUND_RELATED,
  MOCK_SECOND_PROFITER_RELATED,
} from "../fixtures/pm-api-responses";

// --- Helpers ---

const ADDR_A = "0xa3f1234567890abcdef1234567890abcdef123456";
const ADDR_B = "0x7bc234567890abcdef1234567890abcdef234567";
const ADDR_C = "0xd1e234567890abcdef1234567890abcdef345678";
const RESOLUTION_TS = Math.floor(Date.parse("2026-03-15T00:00:00Z") / 1000);

function makeProfiter(overrides: Partial<Suspect> = {}): Suspect {
  return {
    address: ADDR_A,
    rank: 1,
    score: 340_000,
    timingAdvantage: 0,
    volumeUsd: 200_000,
    action: "buy",
    isDexVisible: false,
    pnlUsd: 340_000,
    ...overrides,
  };
}

// --- rankProfiters ---

describe("rankProfiters", () => {
  it("returns empty array when no profitable addresses", () => {
    const result = rankProfiters([], []);
    expect(result).toHaveLength(0);
  });

  it("filters out addresses with negative PnL", () => {
    const pnl: PmPnlByMarketRow[] = [
      { address: ADDR_A, realized_pnl_usd: -50_000, position_size_usd: 100_000 },
    ];
    const result = rankProfiters(pnl, []);
    expect(result).toHaveLength(0);
  });

  it("ranks by PnL descending", () => {
    const result = rankProfiters(MOCK_PNL_BY_MARKET, []);

    expect(result).toHaveLength(3); // top 3 only
    expect(result[0].address).toBe(ADDR_A.toLowerCase());
    expect(result[0].pnlUsd).toBe(340_000);
    expect(result[1].address).toBe(ADDR_B.toLowerCase());
    expect(result[1].pnlUsd).toBe(180_000);
    expect(result[2].address).toBe(ADDR_C.toLowerCase());
    expect(result[2].pnlUsd).toBe(95_000);
  });

  it("limits to top 3 profiters", () => {
    const pnl: PmPnlByMarketRow[] = Array.from({ length: 10 }, (_, i) => ({
      address: `0x${String(i).padStart(40, "0")}`,
      realized_pnl_usd: (10 - i) * 50_000,
    }));

    const result = rankProfiters(pnl, []);
    expect(result).toHaveLength(3);
  });

  it("assigns ranks 1-3", () => {
    const result = rankProfiters(MOCK_PNL_BY_MARKET, []);

    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
    expect(result[2].rank).toBe(3);
  });

  it("picks up entity names from pnl-by-market", () => {
    const result = rankProfiters(MOCK_PNL_BY_MARKET, []);

    expect(result[0].entityName).toBe("Alpha Fund");
    expect(result[2].entityName).toBe("Frequent Trader");
  });

  it("enriches entity names from top-holders", () => {
    const result = rankProfiters(MOCK_PNL_BY_MARKET, MOCK_TOP_HOLDERS);

    // ADDR_A already has entity_name from pnl, should keep it
    expect(result[0].entityName).toBe("Alpha Fund");
    // ADDR_C gets entity_name from top-holders
    expect(result[2].entityName).toBe("Frequent Trader");
  });

  it("merges position size from top-holders (takes max)", () => {
    const pnl: PmPnlByMarketRow[] = [
      { address: ADDR_A, realized_pnl_usd: 100_000, position_size_usd: 50_000 },
    ];
    const holders: PmTopHolderRow[] = [
      { address: ADDR_A, position_size_usd: 200_000, side: "YES", entry_price: 0.12 },
    ];

    const result = rankProfiters(pnl, holders);
    expect(result[0].volumeUsd).toBe(200_000); // max(50K, 200K)
  });

  it("sets default values for PM profiters", () => {
    const pnl: PmPnlByMarketRow[] = [
      { address: ADDR_A, realized_pnl_usd: 100_000 },
    ];

    const result = rankProfiters(pnl, []);
    expect(result[0].action).toBe("buy"); // PM profiters default to "buy"
    expect(result[0].isDexVisible).toBe(false); // PM is not DEX
    expect(result[0].timingAdvantage).toBe(0); // enriched later in Phase 2
  });

  it("uses PnL as score for ranking", () => {
    const result = rankProfiters(MOCK_PNL_BY_MARKET, []);
    expect(result[0].score).toBe(340_000);
    expect(result[1].score).toBe(180_000);
  });
});

// --- enrichProfiters ---

describe("enrichProfiters", () => {
  it("sets timing advantage from earliest trade before resolution", () => {
    const profiters = [makeProfiter({ address: ADDR_A })];
    const trades = new Map<string, PmTradeRow[]>();
    trades.set(ADDR_A.toLowerCase(), MOCK_ALPHA_FUND_TRADES);

    const pnlSummaries = new Map<string, PnlSummaryResponse>();
    const transactions = new Map();
    const relatedWallets = new Map();

    enrichProfiters(profiters, {
      trades,
      pnlSummaries,
      transactions,
      relatedWallets,
      creditsUsed: 0,
    }, RESOLUTION_TS);

    // Alpha Fund traded on 2026-02-22T14:30:00Z, resolution is 2026-03-15T00:00:00Z
    // Difference: ~20.4 days = ~489.5 hours
    expect(profiters[0].timingAdvantage).toBeGreaterThan(400);
    expect(profiters[0].timingAdvantage).toBeLessThan(600);
  });

  it("sets PnL data from profiler pnl-summary", () => {
    const profiters = [makeProfiter({ address: ADDR_A })];
    const trades = new Map<string, PmTradeRow[]>();
    const pnlSummaries = new Map<string, PnlSummaryResponse>();
    pnlSummaries.set(ADDR_A.toLowerCase(), MOCK_ALPHA_FUND_PNL);

    enrichProfiters(profiters, {
      trades,
      pnlSummaries,
      transactions: new Map(),
      relatedWallets: new Map(),
      creditsUsed: 0,
    }, RESOLUTION_TS);

    expect(profiters[0].pnlPercent).toBe(340);
    expect(profiters[0].winRate).toBe(85);
  });

  it("enriches multiple profiters independently", () => {
    const profiters = [
      makeProfiter({ address: ADDR_A, rank: 1 }),
      makeProfiter({ address: ADDR_B, rank: 2, pnlUsd: 180_000 }),
    ];

    const trades = new Map<string, PmTradeRow[]>();
    trades.set(ADDR_A.toLowerCase(), MOCK_ALPHA_FUND_TRADES);
    trades.set(ADDR_B.toLowerCase(), MOCK_SECOND_PROFITER_TRADES);

    const pnlSummaries = new Map<string, PnlSummaryResponse>();
    pnlSummaries.set(ADDR_A.toLowerCase(), MOCK_ALPHA_FUND_PNL);
    pnlSummaries.set(ADDR_B.toLowerCase(), MOCK_SECOND_PROFITER_PNL);

    enrichProfiters(profiters, {
      trades,
      pnlSummaries,
      transactions: new Map(),
      relatedWallets: new Map(),
      creditsUsed: 0,
    }, RESOLUTION_TS);

    expect(profiters[0].winRate).toBe(85);
    expect(profiters[1].winRate).toBe(72);
    // Alpha Fund entered earlier → larger timing advantage
    expect(profiters[0].timingAdvantage).toBeGreaterThan(profiters[1].timingAdvantage);
  });

  it("ignores trades after resolution for timing calculation", () => {
    const profiters = [makeProfiter({ address: ADDR_A })];
    const trades = new Map<string, PmTradeRow[]>();
    // Only has a trade AFTER resolution
    trades.set(ADDR_A.toLowerCase(), [
      {
        market_id: "mkt-1",
        side: "YES",
        price: 0.95,
        size_usd: 200_000,
        block_timestamp: "2026-03-16T10:00:00Z", // after resolution
      },
    ]);

    enrichProfiters(profiters, {
      trades,
      pnlSummaries: new Map(),
      transactions: new Map(),
      relatedWallets: new Map(),
      creditsUsed: 0,
    }, RESOLUTION_TS);

    expect(profiters[0].timingAdvantage).toBe(0); // no pre-resolution trade
  });

  it("leaves timing at 0 when no trades found", () => {
    const profiters = [makeProfiter({ address: ADDR_A })];

    enrichProfiters(profiters, {
      trades: new Map(),
      pnlSummaries: new Map(),
      transactions: new Map(),
      relatedWallets: new Map(),
      creditsUsed: 0,
    }, RESOLUTION_TS);

    expect(profiters[0].timingAdvantage).toBe(0);
  });
});

// --- buildPmClusters ---

describe("buildPmClusters", () => {
  it("returns empty array with fewer than 2 profiters", () => {
    const profiters = [makeProfiter()];
    const relatedWallets = new Map<string, RelatedWalletRow[]>();

    const clusters = buildPmClusters(profiters, relatedWallets);
    expect(clusters).toHaveLength(0);
  });

  it("returns empty array when no related wallet overlap", () => {
    const profiters = [
      makeProfiter({ address: ADDR_A, rank: 1 }),
      makeProfiter({ address: ADDR_B, rank: 2 }),
    ];
    const relatedWallets = new Map<string, RelatedWalletRow[]>();
    // Related wallets point to non-profiter addresses
    relatedWallets.set(ADDR_A.toLowerCase(), [
      { address: "0xunrelated000000000000000000000000000000", relationship_type: "funding" },
    ]);

    const clusters = buildPmClusters(profiters, relatedWallets);
    expect(clusters).toHaveLength(0);
  });

  it("detects related wallet cluster between profiters", () => {
    const profiters = [
      makeProfiter({ address: ADDR_A, rank: 1, entityName: "Alpha Fund" }),
      makeProfiter({ address: ADDR_B, rank: 2 }),
    ];
    const relatedWallets = new Map<string, RelatedWalletRow[]>();
    relatedWallets.set(ADDR_A.toLowerCase(), MOCK_ALPHA_FUND_RELATED);

    const clusters = buildPmClusters(profiters, relatedWallets);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].connectionType).toBe("related_wallets");
    expect(clusters[0].suspects).toHaveLength(2);
  });

  it("detects bidirectional related wallet connections", () => {
    const profiters = [
      makeProfiter({ address: ADDR_A, rank: 1, entityName: "Alpha Fund" }),
      makeProfiter({ address: ADDR_B, rank: 2 }),
    ];
    const relatedWallets = new Map<string, RelatedWalletRow[]>();
    relatedWallets.set(ADDR_A.toLowerCase(), MOCK_ALPHA_FUND_RELATED);
    relatedWallets.set(ADDR_B.toLowerCase(), MOCK_SECOND_PROFITER_RELATED);

    const clusters = buildPmClusters(profiters, relatedWallets);
    // Should still be 1 cluster (not duplicated), since first connection already found
    // The second direction creates a second cluster entry (both are valid)
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    // All clusters should be "related_wallets" type
    clusters.forEach((c) => expect(c.connectionType).toBe("related_wallets"));
  });

  it("does not create duplicate clusters for same pair", () => {
    const profiters = [
      makeProfiter({ address: ADDR_A, rank: 1, entityName: "Alpha Fund" }),
      makeProfiter({ address: ADDR_B, rank: 2 }),
    ];
    const relatedWallets = new Map<string, RelatedWalletRow[]>();
    // Both point to each other
    relatedWallets.set(ADDR_A.toLowerCase(), [
      { address: ADDR_B, relationship_type: "same_entity" },
    ]);
    relatedWallets.set(ADDR_B.toLowerCase(), [
      { address: ADDR_A, entity_name: "Alpha Fund", relationship_type: "same_entity" },
    ]);

    const clusters = buildPmClusters(profiters, relatedWallets);
    // First iteration finds A→B, creates cluster.
    // Second iteration finds B→A, but cluster already exists (alreadyClustered check).
    expect(clusters).toHaveLength(1);
  });

  it("includes description with entity names", () => {
    const profiters = [
      makeProfiter({ address: ADDR_A, rank: 1, entityName: "Alpha Fund" }),
      makeProfiter({ address: ADDR_B, rank: 2 }),
    ];
    const relatedWallets = new Map<string, RelatedWalletRow[]>();
    relatedWallets.set(ADDR_A.toLowerCase(), MOCK_ALPHA_FUND_RELATED);

    const clusters = buildPmClusters(profiters, relatedWallets);
    expect(clusters[0].description).toContain("Alpha Fund");
    expect(clusters[0].description).toContain("related wallets");
  });
});
