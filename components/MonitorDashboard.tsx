"use client";

import { useEffect, useRef, useState } from "react";
import { MonitorEventCard } from "./MonitorEventCard";
import type { SavedMonitorEvent } from "@/lib/cache/queries";

interface MonitorStats {
  totalScanned: number;
  totalFlagged: number;
  lastScanAt: number | null;
}

interface Props {
  initialEvents: SavedMonitorEvent[];
  initialStats: MonitorStats;
}

export function MonitorDashboard({ initialEvents, initialStats }: Props) {
  const [events, setEvents] = useState<SavedMonitorEvent[]>(initialEvents);
  const [stats, setStats] = useState<MonitorStats>(initialStats);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Connect to SSE endpoint for live replay
    const es = new EventSource("/api/monitor/events?mode=replay");
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.addEventListener("stats", (e) => {
      try {
        const data: MonitorStats = JSON.parse(e.data);
        setStats(data);
      } catch {
        // ignore
      }
    });

    es.addEventListener("initial", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (Array.isArray(data.events)) {
          setEvents(data.events);
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener("event", (e) => {
      try {
        const newEvent: SavedMonitorEvent = JSON.parse(e.data);
        setEvents((prev) => [newEvent, ...prev.slice(0, 99)]);
      } catch {
        // ignore
      }
    });

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  const lastScanLabel = stats.lastScanAt
    ? formatLastScan(stats.lastScanAt)
    : "never";

  const pendingCount = events.filter((e) => e.investigated === 0).length;

  return (
    <div>
      {/* Agent status bar */}
      <div className="mb-6 border border-border bg-bg-secondary px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {/* Status indicator */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                connected
                  ? "bg-accent-green animate-pulse-glow"
                  : "bg-verdict-amber"
              }`}
            />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">
              Agent Status:{" "}
              <span className={connected ? "text-accent-green" : "text-verdict-amber"}>
                {connected ? "Active" : "Connecting..."}
              </span>
            </span>
          </div>

          {/* Last scan */}
          <span className="text-[11px] text-text-dim">
            Last scan: <span className="text-text-secondary">{lastScanLabel}</span>
          </span>

          {/* Alerts pending */}
          <span className="text-[11px] text-text-dim">
            <span className="text-accent-amber font-bold">{pendingCount}</span> alerts
            pending
          </span>
        </div>

        {/* Counters */}
        <div className="mt-2 flex gap-6 text-[10px] uppercase tracking-wider text-text-dim">
          <span>
            <span className="text-text-secondary font-mono font-bold">
              {stats.totalScanned.toLocaleString()}
            </span>{" "}
            events scanned
          </span>
          <span>
            <span className="text-accent-amber font-mono font-bold">
              {stats.totalFlagged}
            </span>{" "}
            flagged
          </span>
        </div>
      </div>

      {/* Event feed */}
      <div className="border border-border bg-bg-secondary">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">
            Live Event Feed
          </h3>
        </div>

        {events.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-text-dim">
              No events detected yet. The agent is scanning for notable on-chain
              activity...
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border stagger-fade-in">
            {events.map((event, i) => (
              <MonitorEventCard key={`${event.id}-${i}`} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatLastScan(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000) - timestamp;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
