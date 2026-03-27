import { describe, it, expect } from "vitest";
import { MOCK_PM_REPORT, MOCK_CLEAN_PM_REPORT } from "./pm-report";
import { VERDICT_CONFIG } from "@/lib/forensics/types";

describe("PM report fixtures", () => {
  describe("MOCK_PM_REPORT (suspicious PM report)", () => {
    it("has mode prediction", () => {
      expect(MOCK_PM_REPORT.mode).toBe("prediction");
    });

    it("has PM-specific subject fields", () => {
      expect(MOCK_PM_REPORT.subject.eventTitle).toBeDefined();
      expect(MOCK_PM_REPORT.subject.outcome).toBe("YES");
      expect(MOCK_PM_REPORT.subject.resolutionDate).toBeDefined();
      expect(MOCK_PM_REPORT.subject.marketId).toBeDefined();
    });

    it("has correct verdict for score", () => {
      const score = MOCK_PM_REPORT.suspicionScore;
      // 78 = SUSPICIOUS (60-79)
      expect(MOCK_PM_REPORT.verdict).toBe("SUSPICIOUS");
      expect(score).toBeGreaterThanOrEqual(
        VERDICT_CONFIG.SUSPICIOUS.minScore
      );
    });

    it("has no anomaly (PM mode)", () => {
      expect(MOCK_PM_REPORT.anomaly).toBeNull();
    });

    it("has empty wallet graph (PM mode saves credits)", () => {
      expect(MOCK_PM_REPORT.graph.nodes).toHaveLength(0);
      expect(MOCK_PM_REPORT.graph.edges).toHaveLength(0);
    });

    it("has 3 profiters ranked 1-3", () => {
      expect(MOCK_PM_REPORT.suspects).toHaveLength(3);
      expect(MOCK_PM_REPORT.suspects[0].rank).toBe(1);
      expect(MOCK_PM_REPORT.suspects[1].rank).toBe(2);
      expect(MOCK_PM_REPORT.suspects[2].rank).toBe(3);
    });

    it("profiters have PnL data", () => {
      for (const p of MOCK_PM_REPORT.suspects) {
        expect(p.pnlUsd).toBeDefined();
        expect(p.pnlUsd).toBeGreaterThan(0);
      }
    });

    it("profiters have timing advantage", () => {
      for (const p of MOCK_PM_REPORT.suspects) {
        expect(p.timingAdvantage).toBeGreaterThan(0);
      }
    });

    it("has PM-specific timeline event types", () => {
      const types = MOCK_PM_REPORT.timeline.map((e) => e.type);
      expect(types).toContain("position_entry");
      expect(types).toContain("event_resolution");
    });

    it("has PM-specific evidence factors", () => {
      const factors = MOCK_PM_REPORT.evidence.map((e) => e.factor);
      expect(factors).toContain("position_timing");
      expect(factors).toContain("profit_magnitude");
      expect(factors).toContain("profit_concentration");
      expect(factors).toContain("wallet_connections");
      expect(factors).toContain("track_record");
    });

    it("evidence weights sum to 1.0", () => {
      const total = MOCK_PM_REPORT.evidence.reduce(
        (sum, e) => sum + e.weight,
        0
      );
      expect(total).toBeCloseTo(1.0, 5);
    });

    it("has narrative with PM-specific content", () => {
      expect(MOCK_PM_REPORT.narrative).not.toBeNull();
      expect(MOCK_PM_REPORT.narrative!.caseNarrative).toContain("Polymarket");
      expect(MOCK_PM_REPORT.narrative!.keyFindings).toHaveLength(3);
      expect(MOCK_PM_REPORT.narrative!.shareableLine.length).toBeLessThanOrEqual(120);
    });

    it("timeline is chronologically sorted", () => {
      for (let i = 1; i < MOCK_PM_REPORT.timeline.length; i++) {
        expect(MOCK_PM_REPORT.timeline[i].timestamp).toBeGreaterThanOrEqual(
          MOCK_PM_REPORT.timeline[i - 1].timestamp
        );
      }
    });
  });

  describe("MOCK_CLEAN_PM_REPORT (clean PM report)", () => {
    it("has mode prediction", () => {
      expect(MOCK_CLEAN_PM_REPORT.mode).toBe("prediction");
    });

    it("has zero score and CLEAN verdict", () => {
      expect(MOCK_CLEAN_PM_REPORT.suspicionScore).toBe(0);
      expect(MOCK_CLEAN_PM_REPORT.verdict).toBe("CLEAN");
    });

    it("is an early exit", () => {
      expect(MOCK_CLEAN_PM_REPORT.metadata.earlyExit).toBe(true);
    });

    it("has no suspects/profiters", () => {
      expect(MOCK_CLEAN_PM_REPORT.suspects).toHaveLength(0);
    });

    it("has no narrative", () => {
      expect(MOCK_CLEAN_PM_REPORT.narrative).toBeNull();
    });
  });
});
