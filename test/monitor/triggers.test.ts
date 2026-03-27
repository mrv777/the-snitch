import { describe, it, expect } from "vitest";
import {
  detectLargeSmTrades,
  detectFlowReversals,
  detectPmOddsSwings,
  detectSmAccumulation,
} from "@/lib/monitor/triggers";
import {
  MOCK_SM_DEX_TRADES,
  MOCK_SM_NETFLOW_CURRENT,
  MOCK_SM_NETFLOW_PREVIOUS,
  MOCK_PM_SCREENER_CURRENT,
  MOCK_PM_SCREENER_PREVIOUS,
} from "@/test/fixtures/monitor-api-responses";

describe("detectLargeSmTrades", () => {
  it("detects trades above $100K threshold", () => {
    const events = detectLargeSmTrades(MOCK_SM_DEX_TRADES);

    // Should detect: $500K PEPE buy, $250K WETH sell, $150K DAI buy
    // Should NOT detect: $50K USDT buy (below threshold)
    expect(events).toHaveLength(3);
    expect(events[0].eventType).toBe("sm_large_trade");
    expect(events[0].subjectId).toBe(
      "0x6982508145454Ce325dDbE47a25d4ec3d2311933"
    ); // PEPE
  });

  it("includes entity name in summary when available", () => {
    const events = detectLargeSmTrades(MOCK_SM_DEX_TRADES);

    expect(events[0].summary).toContain("vitalik.eth");
    expect(events[0].summary).toContain("bought");
    expect(events[0].summary).toContain("PEPE");
  });

  it("truncates address when no entity name", () => {
    // Create a trade with no trader_address_label above threshold
    const tradesWithAnon = [
      {
        ...MOCK_SM_DEX_TRADES[0],
        trader_address_label: undefined,
        trader_address: "0x1234567890abcdef1234567890abcdef12345678",
        trade_value_usd: 200_000,
      },
    ];
    const events = detectLargeSmTrades(tradesWithAnon);
    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain("...");
  });

  it("returns empty array when no trades exceed threshold", () => {
    const smallTrades = MOCK_SM_DEX_TRADES.map((t) => ({
      ...t,
      trade_value_usd: 10_000,
    }));
    expect(detectLargeSmTrades(smallTrades)).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(detectLargeSmTrades([])).toHaveLength(0);
  });
});

describe("detectFlowReversals", () => {
  it("detects when netflow sign flips", () => {
    const events = detectFlowReversals(
      MOCK_SM_NETFLOW_CURRENT,
      MOCK_SM_NETFLOW_PREVIOUS
    );

    // WETH: was +500K (inflow) → now -400K (outflow) = reversal
    // PEPE: was +200K → still +1.5M = no reversal
    // DAI: was +100K → still +200K = no reversal
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("flow_reversal");
    expect(events[0].subjectId).toBe(
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
    ); // WETH
    expect(events[0].summary).toContain("WETH");
    expect(events[0].summary).toContain("inflow");
    expect(events[0].summary).toContain("outflow");
  });

  it("returns empty when no previous data for comparison", () => {
    expect(detectFlowReversals(MOCK_SM_NETFLOW_CURRENT, [])).toHaveLength(0);
  });

  it("ignores tokens with zero netflow", () => {
    const zeroNetflow = [
      { ...MOCK_SM_NETFLOW_CURRENT[0], net_flow_24h_usd: 0 },
    ];
    const prevZero = [
      { ...MOCK_SM_NETFLOW_PREVIOUS[0], net_flow_24h_usd: 100_000 },
    ];
    expect(detectFlowReversals(zeroNetflow, prevZero)).toHaveLength(0);
  });
});

describe("detectPmOddsSwings", () => {
  it("detects volume changes above 30% threshold", () => {
    const events = detectPmOddsSwings(
      MOCK_PM_SCREENER_CURRENT,
      MOCK_PM_SCREENER_PREVIOUS
    );

    // BTC 200K: 2M → 5M = +150% → detected
    // ETH 10K: 700K → 800K = +14% → NOT detected
    // Fed rate: 1.5M → 3M = +100% → detected
    expect(events).toHaveLength(2);

    const btcEvent = events.find(
      (e) => (e.data as Record<string, unknown>).marketId === "mkt-btc-200k"
    );
    expect(btcEvent).toBeDefined();
    expect(btcEvent!.eventType).toBe("pm_odds_swing");
    expect(btcEvent!.summary).toContain("surged");

    const fedEvent = events.find(
      (e) => (e.data as Record<string, unknown>).marketId === "mkt-fed-rate"
    );
    expect(fedEvent).toBeDefined();
  });

  it("detects volume drops", () => {
    // Swap current and previous to create a drop scenario
    const events = detectPmOddsSwings(
      MOCK_PM_SCREENER_PREVIOUS,
      MOCK_PM_SCREENER_CURRENT
    );

    // Now volumes are dropping, should detect "dropped"
    const drops = events.filter((e) => e.summary.includes("dropped"));
    expect(drops.length).toBeGreaterThan(0);
  });

  it("returns empty when no previous data", () => {
    expect(detectPmOddsSwings(MOCK_PM_SCREENER_CURRENT, [])).toHaveLength(0);
  });

  it("handles zero volume gracefully", () => {
    // Zero out BTC volume — should be skipped, while others still detected
    const currentWithZero = MOCK_PM_SCREENER_CURRENT.map((m) =>
      m.market_id === "mkt-btc-200k" ? { ...m, volume_24h_usd: 0 } : m
    );
    const events = detectPmOddsSwings(currentWithZero, MOCK_PM_SCREENER_PREVIOUS);

    // BTC has 0 volume → skip, ETH 14% → skip, Fed 100% → detect
    expect(events).toHaveLength(1);
    expect((events[0].data as Record<string, unknown>).marketId).toBe("mkt-fed-rate");
  });
});

describe("detectSmAccumulation", () => {
  it("detects buy trades on tokens with significant net inflows", () => {
    const events = detectSmAccumulation(
      MOCK_SM_DEX_TRADES,
      MOCK_SM_NETFLOW_CURRENT
    );

    // PEPE: has buy trade + 75% net inflow ratio (1.5M / 2M) > 20% → detected
    // DAI: has buy trade + 66% net inflow ratio (200K / 300K) > 20% → detected
    // WETH: has sell trade → NOT detected (sell, not buy)
    // USDT: has buy trade but no netflow data → NOT detected
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.eventType === "sm_accumulation")).toBe(true);
  });

  it("deduplicates events per token", () => {
    // Add a duplicate PEPE buy
    const tradesWithDupe = [
      ...MOCK_SM_DEX_TRADES,
      {
        ...MOCK_SM_DEX_TRADES[0],
        trader_address: "0xdifferentaddress000000000000000000000000",
        trade_value_usd: 200_000,
      },
    ];

    const events = detectSmAccumulation(tradesWithDupe, MOCK_SM_NETFLOW_CURRENT);

    const pepeEvents = events.filter(
      (e) => e.subjectId === "0x6982508145454Ce325dDbE47a25d4ec3d2311933"
    );
    expect(pepeEvents).toHaveLength(1); // deduplicated
  });

  it("ignores sell trades", () => {
    // Remove token_bought_address to make them sell-only trades
    const sellOnly = MOCK_SM_DEX_TRADES.map((t) => ({
      ...t,
      token_bought_address: undefined,
      token_bought_symbol: undefined,
    }));
    expect(detectSmAccumulation(sellOnly, MOCK_SM_NETFLOW_CURRENT)).toHaveLength(
      0
    );
  });

  it("returns empty for empty inputs", () => {
    expect(detectSmAccumulation([], MOCK_SM_NETFLOW_CURRENT)).toHaveLength(0);
    expect(detectSmAccumulation(MOCK_SM_DEX_TRADES, [])).toHaveLength(0);
  });
});
