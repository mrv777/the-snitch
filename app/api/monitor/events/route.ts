import { getRecentMonitorEvents } from "@/lib/cache/queries";
import { getMonitorStats } from "@/lib/monitor/watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/monitor/events
 *
 * SSE stream that replays pre-seeded monitor events from SQLite.
 * Simulates live monitoring by dripping events at ~30s intervals.
 *
 * Query params:
 *   ?mode=replay  — Fake SSE replay (default, for demo)
 *   ?mode=static  — Return all events as JSON (no SSE)
 *   ?limit=50     — Max events to return
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "replay";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);

  // Static mode: return all events as JSON
  if (mode === "static") {
    const events = getRecentMonitorEvents(limit);
    const stats = getMonitorStats();

    return new Response(
      JSON.stringify({ events, stats }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // SSE replay mode: stream events one at a time with delays
  const events = getRecentMonitorEvents(limit);
  const stats = getMonitorStats();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(eventType: string, data: unknown) {
        const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      // Send initial stats
      send("stats", stats);

      // Send existing events as initial batch
      send("initial", { events });

      // Replay events one at a time (~30s interval per spec)
      // Cycle through events to simulate continuous monitoring
      const replayInterval = 30_000; // 30 seconds per spec
      let index = 0;

      // Keep streaming until client disconnects
      // We'll replay the events in a loop
      const maxReplays = events.length * 2; // replay each event at most twice
      for (let i = 0; i < maxReplays && events.length > 0; i++) {
        await sleep(replayInterval);

        const event = events[index % events.length];
        // Simulate a "new" event with a fresh timestamp
        send("event", {
          ...event,
          created_at: Math.floor(Date.now() / 1000),
          replay: true,
        });

        // Update stats for visual effect
        const updatedStats = {
          totalScanned: stats.totalScanned + (i + 1) * 3,
          totalFlagged: stats.totalFlagged + (i % 5 === 0 ? 1 : 0),
          lastScanAt: Math.floor(Date.now() / 1000),
        };
        send("stats", updatedStats);

        index++;
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
