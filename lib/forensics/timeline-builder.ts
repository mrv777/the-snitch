import type {
  TimelineEvent,
  TimelineEventType,
  AnomalyWindow,
  Suspect,
} from "./types";
import type { DexTradeRow, SmartMoneyDexTradeRow } from "@/lib/nansen/types";
import { formatRelativeTime } from "@/lib/utils/format";
import { truncateAddress } from "@/lib/utils/address";

interface TimelineInput {
  anomaly: AnomalyWindow;
  suspects: Suspect[];
  dexTrades: DexTradeRow[];
  smartMoneyTrades: SmartMoneyDexTradeRow[];
  tokenAddress: string;
}

/**
 * Build a forensic timeline from investigation data.
 * Events are sorted by timestamp with T-Xh/T+Xh labels relative to the anomaly peak.
 */
export function buildTimeline(input: TimelineInput): TimelineEvent[] {
  const { anomaly, suspects, dexTrades, smartMoneyTrades, tokenAddress } = input;
  const events: TimelineEvent[] = [];
  const suspectAddresses = new Set(suspects.map((s) => s.address.toLowerCase()));
  const tokenLower = tokenAddress.toLowerCase();

  // Relevant window: 72h before anomaly to 24h after
  const windowStart = anomaly.timestamp - 72 * 3600;
  const windowEnd = anomaly.timestamp + 24 * 3600;

  // 1. Suspect trades from dex-trades (most precise timestamps)
  for (const trade of dexTrades) {
    const ts = toUnix(trade.block_timestamp);
    if (ts === 0 || ts < windowStart || ts > windowEnd) continue;

    const traderAddr = trade.trader_address ?? "";
    const isSuspect = suspectAddresses.has(traderAddr.toLowerCase());

    if (!isSuspect) continue;

    const suspectName =
      trade.trader_address_label || truncateAddress(traderAddr);

    // Determine if buy or sell of the target token based on action field
    const isBuy = trade.action?.toUpperCase() === "BUY";
    const type: TimelineEventType = isBuy ? "suspect_buy" : "suspect_sell";

    events.push({
      timestamp: ts,
      relativeLabel: formatRelativeTime(ts, anomaly.timestamp),
      type,
      actor: suspectName,
      description: `${suspectName} ${isBuy ? "bought" : "sold"} ${formatUsdShort(trade.estimated_value_usd ?? 0)} on DEX`,
      volumeUsd: trade.estimated_value_usd ?? 0,
      transactionHash: trade.transaction_hash,
    });
  }

  // 2. Smart money activity related to the token
  for (const trade of smartMoneyTrades) {
    const boughtAddr = trade.token_bought_address?.toLowerCase() ?? "";
    const soldAddr = trade.token_sold_address?.toLowerCase() ?? "";
    if (boughtAddr !== tokenLower && soldAddr !== tokenLower) continue;
    // Skip if this is already a suspect (avoid duplication)
    if (suspectAddresses.has(trade.trader_address.toLowerCase())) continue;

    const ts = toUnix(trade.block_timestamp);
    if (ts === 0 || ts < windowStart || ts > windowEnd) continue;

    const name = trade.trader_address_label || truncateAddress(trade.trader_address);
    // Derive action from whether the target token was bought or sold
    const isBuy = boughtAddr === tokenLower;
    events.push({
      timestamp: ts,
      relativeLabel: formatRelativeTime(ts, anomaly.timestamp),
      type: "smart_money_activity",
      actor: name,
      description: `Smart money (${name}) ${isBuy ? "bought" : "sold"} ${formatUsdShort(trade.trade_value_usd ?? 0)}`,
      volumeUsd: trade.trade_value_usd ?? 0,
      transactionHash: trade.transaction_hash,
    });
  }

  // 3. The price move event itself (anchor point)
  events.push({
    timestamp: anomaly.timestamp,
    relativeLabel: "T-0",
    type: "price_move",
    description: `Price ${anomaly.direction === "pump" ? "surged" : "crashed"} ${Math.abs(anomaly.priceChangePct).toFixed(1)}%`,
    volumeUsd: anomaly.volume,
  });

  // Sort by timestamp
  events.sort((a, b) => a.timestamp - b.timestamp);

  // Deduplicate events with same timestamp + actor + type
  return deduplicateEvents(events);
}

function deduplicateEvents(events: TimelineEvent[]): TimelineEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.timestamp}:${e.actor || ""}:${e.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toUnix(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  if (isNaN(parsed)) return 0;
  return Math.floor(parsed / 1000);
}

function formatUsdShort(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
