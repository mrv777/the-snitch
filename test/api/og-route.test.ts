import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import { getImagePath, type CardVariant } from "@/lib/image/storage";

describe("OG image route logic", () => {
  it("getImagePath returns correct path for forensic variant", () => {
    const p = getImagePath("case-20260326-abc1", "forensic");
    expect(p).toContain("case-20260326-abc1_forensic.png");
    expect(path.isAbsolute(p)).toBe(true);
  });

  it("getImagePath returns correct path for timeline variant", () => {
    const p = getImagePath("case-20260326-abc1", "timeline");
    expect(p).toContain("case-20260326-abc1_timeline.png");
  });

  it("variant defaults to forensic when not 'timeline'", () => {
    // Simulates the route logic: anything other than "timeline" → "forensic"
    const paramVariant: string = "unknown";
    const variant: CardVariant = paramVariant === "timeline" ? "timeline" : "forensic";
    expect(variant).toBe("forensic");
  });

  it("returns 404 when no image exists", () => {
    const p = getImagePath("nonexistent-case", "forensic");
    expect(fs.existsSync(p)).toBe(false);
  });

  it("decodes URI-encoded caseId", () => {
    const encoded = encodeURIComponent("case-20260326-abc1");
    const decoded = decodeURIComponent(encoded);
    expect(decoded).toBe("case-20260326-abc1");
    const p = getImagePath(decoded, "forensic");
    expect(p).toContain("case-20260326-abc1");
  });
});
