import { NextRequest } from "next/server";
import { pmEventScreener } from "@/lib/nansen/endpoints/prediction";
import { getCachedApiResponse, setCachedApiResponse } from "@/lib/cache/queries";

export const dynamic = "force-dynamic";

const CACHE_KEY = "pm-events-browser";
const CACHE_TTL = 3600; // 1h — events don't change frequently

export async function GET(_request: NextRequest) {
  // Check cache first (avoid spending credits for browsing)
  const cached = getCachedApiResponse(CACHE_KEY);
  if (cached) {
    return new Response(JSON.stringify(cached), {
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const res = await pmEventScreener();

    if (!res.success) {
      return new Response(
        JSON.stringify({
          events: [],
          error: "Failed to fetch events from Nansen",
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // Filter to resolved events only, sort by resolution date descending
    const resolved = res.data
      .filter(
        (e) =>
          e.status === "resolved" ||
          e.status === "closed" ||
          e.outcome
      )
      .sort((a, b) => {
        const dateA = a.resolution_date
          ? Date.parse(a.resolution_date)
          : 0;
        const dateB = b.resolution_date
          ? Date.parse(b.resolution_date)
          : 0;
        return dateB - dateA;
      })
      .slice(0, 30); // last 30 resolved events

    const result = { events: resolved };
    setCachedApiResponse(CACHE_KEY, result, CACHE_TTL);

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Event screener error:", err);
    return new Response(
      JSON.stringify({
        events: [],
        error: "Internal error fetching events",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
