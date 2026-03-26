import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getImagePath, type CardVariant } from "@/lib/image/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params;
  const decoded = decodeURIComponent(caseId);
  const variant: CardVariant =
    request.nextUrl.searchParams.get("variant") === "timeline"
      ? "timeline"
      : "forensic";

  // Try to serve pre-generated card
  const filePath = getImagePath(decoded, variant);

  if (fs.existsSync(filePath)) {
    const buffer = fs.readFileSync(filePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
        "Content-Length": String(buffer.length),
      },
    });
  }

  // Serve generic fallback card (if one exists)
  const fallbackPath = getImagePath("fallback", "forensic");
  if (fs.existsSync(fallbackPath)) {
    const buffer = fs.readFileSync(fallbackPath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=60",
        "Content-Length": String(buffer.length),
      },
    });
  }

  // No image available
  return NextResponse.json(
    { error: "OG image not yet generated" },
    { status: 404 }
  );
}
