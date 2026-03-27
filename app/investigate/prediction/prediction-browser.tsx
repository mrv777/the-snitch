"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils/format";

interface PmEvent {
  event_id: string;
  title: string;
  status: string;
  outcome?: string;
  resolution_date?: string;
  markets?: { market_id: string; title: string }[];
}

export function PredictionBrowser() {
  const [events, setEvents] = useState<PmEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [manualId, setManualId] = useState("");

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch("/api/investigate/prediction/events");
        if (!res.ok) {
          setError("Failed to load events. You can enter an event ID manually.");
          return;
        }
        const data = await res.json();
        setEvents(data.events || []);
      } catch {
        setError("Failed to load events. You can enter an event ID manually.");
      } finally {
        setLoading(false);
      }
    }

    fetchEvents();
  }, []);

  return (
    <div>
      <Link
        href="/"
        className="text-[11px] uppercase tracking-[0.2em] text-text-dim hover:text-accent-green transition-colors"
      >
        ← Back to The Snitch
      </Link>

      <div className="mt-6 mb-8">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.3em] text-text-dim font-mono">
          Prediction Market Forensics
        </p>
        <h1 className="text-2xl font-extrabold uppercase tracking-tight font-display">
          Event{" "}
          <span className="text-accent-green">Browser</span>
        </h1>
        <p className="mt-2 text-xs text-text-secondary">
          Browse recent resolved Polymarket events. Select one to investigate
          who profited and whether anyone had advance knowledge.
        </p>
      </div>

      {/* Manual event ID input */}
      <div className="mb-8">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">
          Or enter an event ID directly
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="Paste event or market ID..."
            className="flex-1 border border-border bg-bg-secondary px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-dim focus:outline-none focus:border-accent-green"
          />
          <Link
            href={
              manualId.trim()
                ? `/investigate/prediction/${encodeURIComponent(manualId.trim())}`
                : "#"
            }
            className={`border px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
              manualId.trim()
                ? "border-accent-green text-accent-green hover:bg-accent-green/10"
                : "border-border text-text-dim cursor-not-allowed"
            }`}
            onClick={(e) => {
              if (!manualId.trim()) e.preventDefault();
            }}
          >
            Investigate
          </Link>
        </div>
      </div>

      {/* Event list */}
      {loading && (
        <div className="py-16 text-center text-sm text-text-dim">
          Loading recent events...
        </div>
      )}

      {error && (
        <div className="py-8 text-center">
          <p className="text-sm text-text-dim">{error}</p>
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-text-dim">
            No recent resolved events found. Try entering an event ID manually.
          </p>
        </div>
      )}

      {events.length > 0 && (
        <div className="space-y-2">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">
            Recently Resolved Events
          </p>
          {events.map((event) => (
            <Link
              key={event.event_id}
              href={`/investigate/prediction/${encodeURIComponent(event.event_id)}`}
              className="block border border-border bg-bg-secondary px-4 py-3 hover:border-accent-green/50 transition-colors group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary group-hover:text-accent-green transition-colors truncate">
                    {event.title}
                  </p>
                  <div className="mt-1 flex gap-3 text-[10px] uppercase text-text-dim">
                    <span>Status: {event.status}</span>
                    {event.outcome && (
                      <span className="text-accent-green">
                        Outcome: {event.outcome}
                      </span>
                    )}
                    {event.resolution_date && (
                      <span>
                        Resolved:{" "}
                        {formatDate(
                          Math.floor(
                            Date.parse(event.resolution_date) / 1000
                          )
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-text-dim group-hover:text-accent-green transition-colors">
                  Investigate →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
