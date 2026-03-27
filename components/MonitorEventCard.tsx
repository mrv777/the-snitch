"use client";

import Link from "next/link";
import { formatTimeAgo, formatCompactUsd } from "@/lib/utils/format";
import { truncateAddress } from "@/lib/utils/address";
import type { SavedMonitorEvent } from "@/lib/cache/queries";

interface Props {
  event: SavedMonitorEvent;
}

const EVENT_TYPE_CONFIG: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  sm_large_trade: {
    label: "LARGE TRADE",
    icon: "TX",
    color: "#FF4444",
  },
  flow_reversal: {
    label: "FLOW REVERSAL",
    icon: "FLOW",
    color: "#FFB800",
  },
  pm_odds_swing: {
    label: "ODDS SWING",
    icon: "PM",
    color: "#FF8800",
  },
  sm_accumulation: {
    label: "ACCUMULATION",
    icon: "ACC",
    color: "#00D4FF",
  },
};

function getInvestigateUrl(event: SavedMonitorEvent): string | null {
  if (event.event_type === "pm_odds_swing") {
    // PM events don't link to token investigations
    try {
      const data = JSON.parse(event.data_json);
      if (data.marketId) {
        return `/investigate/prediction/${encodeURIComponent(data.marketId)}`;
      }
    } catch {
      // fall through
    }
    return null;
  }

  // Token-based events link to token investigation
  if (event.subject_id && event.subject_id.startsWith("0x")) {
    let chain = "ethereum";
    try {
      const data = JSON.parse(event.data_json);
      if (data.chain) chain = data.chain;
    } catch {
      // default chain
    }
    return `/investigate/token/${encodeURIComponent(event.subject_id)}?chain=${chain}`;
  }

  return null;
}

function getTokenSymbol(event: SavedMonitorEvent): string | null {
  try {
    const data = JSON.parse(event.data_json);
    return data.tokenSymbol || null;
  } catch {
    return null;
  }
}

function getAmountUsd(event: SavedMonitorEvent): number | null {
  try {
    const data = JSON.parse(event.data_json);
    return data.amountUsd || data.tradeAmountUsd || null;
  } catch {
    return null;
  }
}

export function MonitorEventCard({ event }: Props) {
  const config = EVENT_TYPE_CONFIG[event.event_type] ?? {
    label: event.event_type.toUpperCase(),
    icon: "?",
    color: "#888888",
  };

  const investigateUrl = getInvestigateUrl(event);
  const tokenSymbol = getTokenSymbol(event);
  const amount = getAmountUsd(event);

  return (
    <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-bg-card">
      {/* Type icon */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center text-[9px] font-bold tracking-wider"
        style={{
          color: config.color,
          border: `1px solid ${config.color}40`,
          backgroundColor: `${config.color}10`,
        }}
      >
        {config.icon}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Type label + timestamp */}
        <div className="mb-1 flex items-center gap-2">
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: config.color }}
          >
            {config.label}
          </span>
          <span className="text-[10px] text-text-dim">
            {formatTimeAgo(event.created_at)}
          </span>
          {event.investigated === 1 && (
            <span className="text-[9px] uppercase tracking-wider text-accent-green">
              Investigated
            </span>
          )}
        </div>

        {/* Summary */}
        <p className="text-sm text-text-secondary leading-snug">
          {event.summary}
        </p>

        {/* Meta row */}
        <div className="mt-1.5 flex items-center gap-3 text-[10px] text-text-dim">
          {tokenSymbol && (
            <span className="font-bold text-text-secondary">${tokenSymbol}</span>
          )}
          {event.subject_id && event.subject_id.startsWith("0x") && (
            <span className="font-mono">{truncateAddress(event.subject_id)}</span>
          )}
          {amount !== null && (
            <span>{formatCompactUsd(amount)}</span>
          )}
        </div>
      </div>

      {/* Investigate button */}
      {investigateUrl && (
        <Link
          href={investigateUrl}
          className="shrink-0 border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-text-dim transition-colors hover:border-accent-green hover:text-accent-green"
        >
          Investigate
        </Link>
      )}
    </div>
  );
}
