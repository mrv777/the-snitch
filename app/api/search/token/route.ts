import { NextRequest, NextResponse } from "next/server";
import { searchTokens } from "@/lib/external/coingecko";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  const results = await searchTokens(query);
  return NextResponse.json(results);
}
