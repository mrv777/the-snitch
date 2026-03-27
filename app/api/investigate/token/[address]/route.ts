import { NextRequest } from "next/server";
import { investigateToken } from "@/lib/forensics/token-investigator";
import { getInvestigationBySubject, updateInvestigationCardPaths } from "@/lib/cache/queries";
import { checkRateLimit, recordInvestigation, getClientIp } from "@/lib/rate-limit/limiter";
import { canAfford } from "@/lib/budget/tracker";
import { isValidAddress, isEvmAddress, detectChain } from "@/lib/utils/address";
import { renderBothCards } from "@/lib/image/renderer";
import type { SSEEvent, ForensicReport } from "@/lib/forensics/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  const rawAddress = decodeURIComponent(address).trim();
  const chain =
    request.nextUrl.searchParams.get("chain") ||
    detectChain(rawAddress) ||
    "ethereum";
  // Nansen API requires lowercase EVM addresses for OHLCV data
  const tokenAddress = isEvmAddress(rawAddress) ? rawAddress.toLowerCase() : rawAddress;

  // Validate address
  if (!isValidAddress(tokenAddress)) {
    return new Response(
      JSON.stringify({ error: "invalid_address", message: "Invalid token address" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check for cached investigation (return immediately if fresh)
  const cached = getInvestigationBySubject(tokenAddress, "token", chain);
  if (cached) {
    const age = Math.floor(Date.now() / 1000) - cached.created_at;
    if (age < 86400) {
      // Fresh enough — return cached report
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
  if (!canAfford(600)) {
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
        const report = await investigateToken({
          tokenAddress,
          chain,
          onProgress: send,
        });

        // Final event with complete report
        send({ type: "report_complete", data: report });

        // Generate OG card images in the background (fire-and-forget)
        renderBothCards(report.caseId)
          .then(({ forensicPath, timelinePath }) => {
            updateInvestigationCardPaths(report.caseId, forensicPath, timelinePath);
          })
          .catch((err) => console.error("Card render failed:", err));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Investigation failed";
        const stack = err instanceof Error ? err.stack : undefined;
        if (stack) console.error("Investigation error:", stack);
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
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  const rawAddr = decodeURIComponent(address).trim();
  const tokenAddress = isEvmAddress(rawAddr) ? rawAddr.toLowerCase() : rawAddr;
  const chain = request.nextUrl.searchParams.get("chain") || undefined;

  const cached = getInvestigationBySubject(tokenAddress, "token", chain);
  if (cached) {
    const report: ForensicReport = JSON.parse(cached.report_json);
    return new Response(JSON.stringify(report), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ error: "not_found", message: "No investigation found for this token" }),
    { status: 404, headers: { "Content-Type": "application/json" } }
  );
}
