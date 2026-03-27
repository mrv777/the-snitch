import { describe, it, expect } from "vitest";
import { buildProgrammaticNarrative } from "@/lib/forensics/narrative-generator";
import { MOCK_PM_REPORT, MOCK_CLEAN_PM_REPORT } from "../fixtures/pm-report";

describe("buildProgrammaticNarrative (PM mode)", () => {
  it("generates PM narrative for a report with profiters", () => {
    const narrative = buildProgrammaticNarrative(MOCK_PM_REPORT);

    expect(narrative.caseNarrative).toContain("Polymarket");
    expect(narrative.caseNarrative).toContain(MOCK_PM_REPORT.subject.eventTitle!);
    expect(narrative.caseNarrative).toContain("Alpha Fund");
    expect(narrative.verdictLabel).toBe("SUSPICIOUS");
    expect(narrative.keyFindings).toHaveLength(3);
    expect(narrative.keyFindings.every((f) => f.length <= 100)).toBe(true);
    expect(narrative.shareableLine.length).toBeLessThanOrEqual(120);
  });

  it("generates PM narrative for a clean report", () => {
    const narrative = buildProgrammaticNarrative(MOCK_CLEAN_PM_REPORT);

    expect(narrative.caseNarrative).toContain("Polymarket");
    expect(narrative.verdictLabel).toBe("CLEAN");
    expect(narrative.keyFindings).toHaveLength(3);
    // Should pad with "Further investigation recommended"
    expect(
      narrative.keyFindings.filter((f) => f === "Further investigation recommended")
        .length
    ).toBeGreaterThan(0);
  });

  it("includes timing information for profiters with timing advantage", () => {
    const narrative = buildProgrammaticNarrative(MOCK_PM_REPORT);

    // 504 hours = 21 days
    expect(narrative.caseNarrative).toContain("21 days");
  });

  it("includes PnL in shareable line when available", () => {
    const narrative = buildProgrammaticNarrative(MOCK_PM_REPORT);

    expect(narrative.shareableLine).toContain("$340");
  });

  it("does not use token-specific language for PM reports", () => {
    const narrative = buildProgrammaticNarrative(MOCK_PM_REPORT);

    expect(narrative.caseNarrative).not.toContain("pump");
    expect(narrative.caseNarrative).not.toContain("dump");
    expect(narrative.caseNarrative).not.toContain("price move");
  });
});
