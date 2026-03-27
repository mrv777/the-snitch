import type {
  TimelineEvent,
  TimelineEventType,
  Suspect,
} from "./types";
import type { PmTradeRow } from "@/lib/nansen/types";
import { truncateAddress } from "@/lib/utils/address";

interface PmTimelineInput {
  profiters: Suspect[];
  trades: Map<string, PmTradeRow[]>; // address → trades
  resolutionTimestamp: number; // unix seconds when event resolved
  eventTitle: string;
  outcome: string;
}

/**
 * Build a forensic timeline for a prediction market investigation.
 * Events: position entries → odds movements → event resolution → position exits.
 * Relative timestamps (T-Xd, T+Xh) anchored to the event resolution.
 */
export function buildPmTimeline(input: PmTimelineInput): TimelineEvent[] {
  const { profiters, trades, resolutionTimestamp, eventTitle, outcome } = input;
  const events: TimelineEvent[] = [];
  const profiterAddresses = new Set(
    profiters.map((p) => p.address.toLowerCase())
  );

  // 1. Profiter trades (position entries and exits)
  for (const [address, addressTrades] of trades) {
    const addrLower = address.toLowerCase();
    if (!profiterAddresses.has(addrLower)) continue;

    const profiter = profiters.find(
      (p) => p.address.toLowerCase() === addrLower
    );
    const name =
      profiter?.entityName || truncateAddress(address);

    for (const trade of addressTrades) {
      const ts = toUnix(trade.block_timestamp);
      if (ts === 0) continue;

      const isBeforeResolution = ts < resolutionTimestamp;
      const type: TimelineEventType = isBeforeResolution
        ? "position_entry"
        : "position_exit";

      events.push({
        timestamp: ts,
        relativeLabel: formatRelativeToResolution(ts, resolutionTimestamp),
        type,
        actor: name,
        description: `${name} ${trade.side} ${formatUsdShort(trade.size_usd)} at $${trade.price.toFixed(2)}`,
        volumeUsd: trade.size_usd,
        transactionHash: trade.transaction_hash,
      });
    }
  }

  // 2. Event resolution (anchor point)
  events.push({
    timestamp: resolutionTimestamp,
    relativeLabel: "T-0",
    type: "event_resolution",
    description: `Event resolved: "${truncateTitle(eventTitle)}" → ${outcome}`,
  });

  // Sort by timestamp
  events.sort((a, b) => a.timestamp - b.timestamp);

  // Deduplicate
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

/**
 * Format relative time to resolution.
 * Uses days for >24h (T-5d), hours for <24h (T-6h, T+2h).
 */
function formatRelativeToResolution(
  eventTimestamp: number,
  resolutionTimestamp: number
): string {
  const diffSeconds = eventTimestamp - resolutionTimestamp;
  const diffHours = Math.abs(diffSeconds) / 3600;
  const sign = diffSeconds >= 0 ? "+" : "-";

  if (diffHours >= 24) {
    const days = Math.round(diffHours / 24);
    return `T${sign}${days}d`;
  }

  if (diffHours >= 1) {
    return `T${sign}${Math.round(diffHours)}h`;
  }

  const minutes = Math.round(Math.abs(diffSeconds) / 60);
  return `T${sign}${minutes}m`;
}

function formatUsdShort(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function truncateTitle(title: string, maxLen = 60): string {
  return title.length > maxLen ? title.slice(0, maxLen - 3) + "..." : title;
}
