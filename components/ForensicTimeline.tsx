"use client";

import type { TimelineEvent, TimelineEventType } from "@/lib/forensics/types";
import { formatCompactUsd } from "@/lib/utils/format";
import { truncateAddress } from "@/lib/utils/address";

interface Props {
  events: TimelineEvent[];
}

const EVENT_COLORS: Record<TimelineEventType, string> = {
  suspect_buy: "#FF4444",
  suspect_sell: "#FF8800",
  smart_money_activity: "#00D4FF",
  price_move: "#00FF88",
  flow_reversal: "#FFB800",
  large_transfer: "#888888",
  // PM-specific event types
  position_entry: "#FF4444",
  position_exit: "#FF8800",
  odds_movement: "#FFB800",
  event_resolution: "#00FF88",
};

const EVENT_ICONS: Record<TimelineEventType, string> = {
  suspect_buy: "BUY",
  suspect_sell: "SELL",
  smart_money_activity: "SM",
  price_move: "PRICE",
  flow_reversal: "FLOW",
  large_transfer: "TX",
  // PM-specific event types
  position_entry: "ENTRY",
  position_exit: "EXIT",
  odds_movement: "ODDS",
  event_resolution: "RESOLVED",
};

export function ForensicTimeline({ events }: Props) {
  if (events.length === 0) return null;

  return (
    <div className="animate-fade-in">
      <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">
        Forensic Timeline
      </p>

      <div className="relative pl-6">
        {/* Vertical line */}
        <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />

        <div className="space-y-0 stagger-fade-in">
          {events.map((event, i) => {
            const color = EVENT_COLORS[event.type];
            const isPriceMove = event.type === "price_move" || event.type === "event_resolution";

            return (
              <div
                key={i}
                className={`relative flex items-start gap-3 py-2.5 ${
                  isPriceMove ? "my-1" : ""
                }`}
              >
                {/* Dot on the timeline */}
                <div
                  className="absolute -left-4 top-3 h-2 w-2 rounded-full animate-timeline-pulse"
                  style={{ backgroundColor: color, color }}
                />

                {/* Relative time label */}
                <span
                  className="w-12 shrink-0 text-right text-xs font-bold font-mono"
                  style={{ color }}
                >
                  {event.relativeLabel}
                </span>

                {/* Event type badge */}
                <span
                  className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border"
                  style={{
                    color,
                    borderColor: `${color}40`,
                    backgroundColor: `${color}10`,
                  }}
                >
                  {EVENT_ICONS[event.type]}
                </span>

                {/* Description */}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm ${isPriceMove ? "font-bold" : ""}`}
                    style={isPriceMove ? { color } : undefined}
                  >
                    {isPriceMove ? (
                      event.description
                    ) : (
                      <>
                        {event.actor && (
                          <span className="text-text-secondary font-mono">
                            {truncateAddress(event.actor)}
                          </span>
                        )}{" "}
                        <span className="text-text-secondary">
                          {event.description}
                        </span>
                      </>
                    )}
                  </p>
                  {event.volumeUsd !== undefined && event.volumeUsd > 0 && (
                    <p className="text-xs text-text-dim">
                      {formatCompactUsd(event.volumeUsd)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
