import { describe, it, expect } from "vitest";
import { buildPmTimeline } from "@/lib/forensics/pm-timeline-builder";
import type { Suspect } from "@/lib/forensics/types";
import type { PmTradeRow } from "@/lib/nansen/types";

// --- Helpers ---

function makeProfiter(overrides: Partial<Suspect> = {}): Suspect {
  return {
    address: "0xaaaa000000000000000000000000000000000001",
    rank: 1,
    score: 100_000,
    timingAdvantage: 336,
    volumeUsd: 150_000,
    action: "buy",
    isDexVisible: false,
    ...overrides,
  };
}

const RESOLUTION_TS = Math.floor(Date.parse("2026-03-15T00:00:00Z") / 1000);

// --- Tests ---

describe("buildPmTimeline", () => {
  it("returns empty array with no profiters and no trades", () => {
    const events = buildPmTimeline({
      profiters: [],
      trades: new Map(),
      resolutionTimestamp: RESOLUTION_TS,
      eventTitle: "Test Event",
      outcome: "YES",
    });

    // Should still have the resolution event
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("event_resolution");
  });

  it("always includes the event resolution anchor", () => {
    const events = buildPmTimeline({
      profiters: [makeProfiter()],
      trades: new Map(),
      resolutionTimestamp: RESOLUTION_TS,
      eventTitle: "Will BTC hit $200K?",
      outcome: "YES",
    });

    const resolution = events.find((e) => e.type === "event_resolution");
    expect(resolution).toBeDefined();
    expect(resolution!.relativeLabel).toBe("T-0");
    expect(resolution!.description).toContain("Will BTC hit $200K?");
    expect(resolution!.description).toContain("YES");
  });

  it("marks trades before resolution as position_entry", () => {
    const addr = "0xaaaa000000000000000000000000000000000001";
    const trades = new Map<string, PmTradeRow[]>();
    trades.set(addr.toLowerCase(), [
      {
        market_id: "mkt-1",
        side: "YES",
        price: 0.12,
        size_usd: 200_000,
        block_timestamp: "2026-02-22T14:30:00Z", // 21 days before resolution
      },
    ]);

    const events = buildPmTimeline({
      profiters: [makeProfiter({ address: addr })],
      trades,
      resolutionTimestamp: RESOLUTION_TS,
      eventTitle: "Test",
      outcome: "YES",
    });

    const entries = events.filter((e) => e.type === "position_entry");
    expect(entries).toHaveLength(1);
    expect(entries[0].volumeUsd).toBe(200_000);
    expect(entries[0].relativeLabel).toMatch(/^T-/); // before resolution
  });

  it("marks trades after resolution as position_exit", () => {
    const addr = "0xaaaa000000000000000000000000000000000001";
    const trades = new Map<string, PmTradeRow[]>();
    trades.set(addr.toLowerCase(), [
      {
        market_id: "mkt-1",
        side: "YES",
        price: 0.95,
        size_usd: 180_000,
        block_timestamp: "2026-03-16T10:00:00Z", // 1 day after resolution
      },
    ]);

    const events = buildPmTimeline({
      profiters: [makeProfiter({ address: addr })],
      trades,
      resolutionTimestamp: RESOLUTION_TS,
      eventTitle: "Test",
      outcome: "YES",
    });

    const exits = events.filter((e) => e.type === "position_exit");
    expect(exits).toHaveLength(1);
    expect(exits[0].relativeLabel).toMatch(/^T\+/); // after resolution
  });

  it("sorts events chronologically", () => {
    const addr1 = "0xaaaa000000000000000000000000000000000001";
    const addr2 = "0xbbbb000000000000000000000000000000000002";
    const trades = new Map<string, PmTradeRow[]>();
    trades.set(addr1.toLowerCase(), [
      {
        market_id: "mkt-1",
        side: "YES",
        price: 0.12,
        size_usd: 200_000,
        block_timestamp: "2026-02-22T14:30:00Z",
      },
    ]);
    trades.set(addr2.toLowerCase(), [
      {
        market_id: "mkt-1",
        side: "YES",
        price: 0.2,
        size_usd: 150_000,
        block_timestamp: "2026-03-01T10:00:00Z",
      },
    ]);

    const events = buildPmTimeline({
      profiters: [
        makeProfiter({ address: addr1, rank: 1 }),
        makeProfiter({ address: addr2, rank: 2 }),
      ],
      trades,
      resolutionTimestamp: RESOLUTION_TS,
      eventTitle: "Test",
      outcome: "YES",
    });

    // Events should be in chronological order
    for (let i = 1; i < events.length; i++) {
      expect(events[i].timestamp).toBeGreaterThanOrEqual(events[i - 1].timestamp);
    }
  });

  it("deduplicates events with same timestamp, actor, and type", () => {
    const addr = "0xaaaa000000000000000000000000000000000001";
    const ts = "2026-02-22T14:30:00Z";
    const trades = new Map<string, PmTradeRow[]>();
    trades.set(addr.toLowerCase(), [
      { market_id: "mkt-1", side: "YES", price: 0.12, size_usd: 100_000, block_timestamp: ts },
      { market_id: "mkt-1", side: "YES", price: 0.13, size_usd: 100_000, block_timestamp: ts }, // same ts
    ]);

    const events = buildPmTimeline({
      profiters: [makeProfiter({ address: addr })],
      trades,
      resolutionTimestamp: RESOLUTION_TS,
      eventTitle: "Test",
      outcome: "YES",
    });

    // Should deduplicate: 1 entry + 1 resolution = 2 (not 3)
    const entries = events.filter((e) => e.type === "position_entry");
    expect(entries).toHaveLength(1);
  });

  it("uses days for relative labels > 24h", () => {
    const addr = "0xaaaa000000000000000000000000000000000001";
    const trades = new Map<string, PmTradeRow[]>();
    trades.set(addr.toLowerCase(), [
      {
        market_id: "mkt-1",
        side: "YES",
        price: 0.12,
        size_usd: 200_000,
        block_timestamp: "2026-02-22T00:00:00Z", // 21 days before
      },
    ]);

    const events = buildPmTimeline({
      profiters: [makeProfiter({ address: addr })],
      trades,
      resolutionTimestamp: RESOLUTION_TS,
      eventTitle: "Test",
      outcome: "YES",
    });

    const entry = events.find((e) => e.type === "position_entry");
    expect(entry).toBeDefined();
    expect(entry!.relativeLabel).toMatch(/T-\d+d/); // e.g. T-21d
  });

  it("only includes trades from profiter addresses", () => {
    const profiterAddr = "0xaaaa000000000000000000000000000000000001";
    const otherAddr = "0xcccc000000000000000000000000000000000003";
    const trades = new Map<string, PmTradeRow[]>();
    trades.set(profiterAddr.toLowerCase(), [
      { market_id: "mkt-1", side: "YES", price: 0.12, size_usd: 200_000, block_timestamp: "2026-02-22T14:30:00Z" },
    ]);
    trades.set(otherAddr.toLowerCase(), [
      { market_id: "mkt-1", side: "NO", price: 0.8, size_usd: 50_000, block_timestamp: "2026-03-10T10:00:00Z" },
    ]);

    const events = buildPmTimeline({
      profiters: [makeProfiter({ address: profiterAddr })],
      trades,
      resolutionTimestamp: RESOLUTION_TS,
      eventTitle: "Test",
      outcome: "YES",
    });

    // 1 entry from profiter + 1 resolution = 2 (no entry from other addr)
    expect(events).toHaveLength(2);
  });
});
