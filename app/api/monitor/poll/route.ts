import { NextRequest } from "next/server";
import { pollOnce } from "@/lib/monitor/watcher";
import { canAfford } from "@/lib/budget/tracker";
import { checkPollRateLimit, recordPoll, getClientIp } from "@/lib/rate-limit/limiter";

export const dynamic = "force-dynamic";

/**
 * POST /api/monitor/poll
 *
 * Trigger one monitor poll cycle. Calls smart-money dex-trades + netflow
 * across chains plus PM market-screener, checks trigger conditions,
 * and saves any flagged events.
 *
 * Used during development to seed real data (2-3 cycles, ~300-450 credits).
 */
export async function POST(request: NextRequest) {
  // Rate limit — 10 polls/day per IP to prevent credit exhaustion
  const ip = getClientIp(request);
  const rateLimit = checkPollRateLimit(ip);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: `Poll rate limited. ${rateLimit.remaining} polls remaining. Resets in ${Math.ceil(rateLimit.resetIn / 3600)}h.`,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  // Budget check — polls cost ~110-150 credits
  if (!canAfford(150)) {
    return new Response(
      JSON.stringify({
        error: "credits_exhausted",
        message: "Insufficient credits for monitor poll cycle (~150 credits needed).",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    recordPoll(ip);
    const result = await pollOnce();

    return new Response(
      JSON.stringify({
        success: true,
        eventsDetected: result.events.length,
        events: result.events,
        creditsUsed: result.creditsUsed,
        errors: result.errors.length > 0 ? result.errors : undefined,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Poll cycle failed";
    return new Response(
      JSON.stringify({ error: "poll_failed", message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
