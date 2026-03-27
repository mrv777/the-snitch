import { NextRequest } from "next/server";
import { investigatePrediction } from "@/lib/forensics/prediction-investigator";
import { getInvestigationBySubject } from "@/lib/cache/queries";
import { checkRateLimit, recordInvestigation, getClientIp } from "@/lib/rate-limit/limiter";
import { canAfford } from "@/lib/budget/tracker";
import type { SSEEvent, ForensicReport } from "@/lib/forensics/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const decodedEventId = decodeURIComponent(eventId).trim();
  const marketId = request.nextUrl.searchParams.get("marketId") || undefined;

  if (!decodedEventId) {
    return new Response(
      JSON.stringify({ error: "invalid_event", message: "Event ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check for cached investigation (return immediately if fresh)
  // Always look up by eventId — the canonical key saved by the investigator
  const cached = getInvestigationBySubject(decodedEventId, "prediction");
  if (cached) {
    const age = Math.floor(Date.now() / 1000) - cached.created_at;
    if (age < 86400) {
      const report: ForensicReport = JSON.parse(cached.report_json);
      return new Response(JSON.stringify(report), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Rate limit check
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: `Rate limited. ${rateLimit.remaining} investigations remaining. Resets in ${Math.ceil(rateLimit.resetIn / 3600)}h.`,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  // Budget check
  if (!canAfford(400)) {
    return new Response(
      JSON.stringify({
        error: "credits_exhausted",
        message: "Daily credit budget exhausted. Browse existing reports below.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: SSEEvent) {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      }

      // Record rate limit once the investigation actually starts
      recordInvestigation(ip);

      try {
        const report = await investigatePrediction({
          eventId: decodedEventId,
          marketId,
          onProgress: send,
        });

        // Final event with complete report
        send({ type: "report_complete", data: report });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Investigation failed";
        send({ type: "error", data: { message } });
      } finally {
        controller.close();
      }
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

// GET handler returns cached report if available
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const decodedEventId = decodeURIComponent(eventId).trim();

  const cached = getInvestigationBySubject(decodedEventId, "prediction");
  if (cached) {
    const report: ForensicReport = JSON.parse(cached.report_json);
    return new Response(JSON.stringify(report), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ error: "not_found", message: "No investigation found for this event" }),
    { status: 404, headers: { "Content-Type": "application/json" } }
  );
}
