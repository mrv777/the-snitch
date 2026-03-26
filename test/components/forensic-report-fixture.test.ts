import { describe, it, expect } from "vitest";
import { MOCK_REPORT, MOCK_CLEAN_REPORT } from "../fixtures/forensic-report";
import { scoreToVerdict, VERDICT_CONFIG } from "@/lib/forensics/types";
import type { ForensicReport } from "@/lib/forensics/types";

/**
 * Tests validating the fixture data integrity.
 * Ensures the test fixtures are internally consistent.
 */
describe("MOCK_REPORT fixture integrity", () => {
  it("has consistent verdict for score", () => {
    expect(scoreToVerdict(MOCK_REPORT.suspicionScore)).toBe(
      MOCK_REPORT.verdict
    );
  });

  it("has suspects ranked 1-3", () => {
    expect(MOCK_REPORT.suspects).toHaveLength(3);
    MOCK_REPORT.suspects.forEach((s, i) => {
      expect(s.rank).toBe(i + 1);
    });
  });

  it("has suspects sorted by score descending", () => {
    for (let i = 1; i < MOCK_REPORT.suspects.length; i++) {
      expect(MOCK_REPORT.suspects[i].score).toBeLessThanOrEqual(
        MOCK_REPORT.suspects[i - 1].score
      );
    }
  });

  it("has timeline events sorted by timestamp", () => {
    for (let i = 1; i < MOCK_REPORT.timeline.length; i++) {
      expect(MOCK_REPORT.timeline[i].timestamp).toBeGreaterThanOrEqual(
        MOCK_REPORT.timeline[i - 1].timestamp
      );
    }
  });

  it("has evidence weights summing to 1.0", () => {
    const totalWeight = MOCK_REPORT.evidence.reduce(
      (sum, e) => sum + e.weight,
      0
    );
    expect(totalWeight).toBeCloseTo(1.0, 2);
  });

  it("has all 5 evidence factors", () => {
    const factors = new Set(MOCK_REPORT.evidence.map((e) => e.factor));
    expect(factors.size).toBe(5);
    expect(factors.has("timing")).toBe(true);
    expect(factors.has("volume_concentration")).toBe(true);
    expect(factors.has("wallet_connections")).toBe(true);
    expect(factors.has("smart_money_labels")).toBe(true);
    expect(factors.has("profit_magnitude")).toBe(true);
  });

  it("has graph nodes for all suspects", () => {
    const suspectAddresses = new Set(
      MOCK_REPORT.suspects.map((s) => s.address)
    );
    const nodeIds = new Set(MOCK_REPORT.graph.nodes.map((n) => n.id));
    for (const addr of suspectAddresses) {
      expect(nodeIds.has(addr)).toBe(true);
    }
  });

  it("has graph edges referencing existing nodes", () => {
    const nodeIds = new Set(MOCK_REPORT.graph.nodes.map((n) => n.id));
    for (const edge of MOCK_REPORT.graph.edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });

  it("has narrative with required fields", () => {
    expect(MOCK_REPORT.narrative).not.toBeNull();
    const n = MOCK_REPORT.narrative!;
    expect(n.caseNarrative.length).toBeGreaterThan(100);
    expect(n.keyFindings.length).toBe(3);
    n.keyFindings.forEach((f) => expect(f.length).toBeLessThanOrEqual(100));
    expect(n.shareableLine.length).toBeLessThanOrEqual(120);
    expect(n.verdictLabel).toBe("SUSPICIOUS");
  });

  it("has metadata with all completed phases", () => {
    expect(MOCK_REPORT.metadata.phasesCompleted).toEqual([0, 1, 2, 3]);
    expect(MOCK_REPORT.metadata.earlyExit).toBe(false);
  });

  it("has valid caseId format", () => {
    expect(MOCK_REPORT.caseId).toMatch(/^case-\d{8}-[a-f0-9]{4}$/);
  });
});

describe("MOCK_CLEAN_REPORT fixture integrity", () => {
  it("has score 0 and CLEAN verdict", () => {
    expect(MOCK_CLEAN_REPORT.suspicionScore).toBe(0);
    expect(MOCK_CLEAN_REPORT.verdict).toBe("CLEAN");
  });

  it("has no anomaly", () => {
    expect(MOCK_CLEAN_REPORT.anomaly).toBeNull();
  });

  it("has no suspects", () => {
    expect(MOCK_CLEAN_REPORT.suspects).toHaveLength(0);
  });

  it("has empty graph", () => {
    expect(MOCK_CLEAN_REPORT.graph.nodes).toHaveLength(0);
    expect(MOCK_CLEAN_REPORT.graph.edges).toHaveLength(0);
  });

  it("has earlyExit true", () => {
    expect(MOCK_CLEAN_REPORT.metadata.earlyExit).toBe(true);
    expect(MOCK_CLEAN_REPORT.metadata.phasesCompleted).toEqual([0]);
  });

  it("has no narrative", () => {
    expect(MOCK_CLEAN_REPORT.narrative).toBeNull();
  });
});

describe("ForensicReport type compatibility", () => {
  it("both fixtures are valid ForensicReport type", () => {
    // TypeScript compile-time check — if this compiles, it's valid.
    const _full: ForensicReport = MOCK_REPORT;
    const _clean: ForensicReport = MOCK_CLEAN_REPORT;
    expect(_full.mode).toBe("token");
    expect(_clean.mode).toBe("token");
  });

  it("can JSON roundtrip without data loss", () => {
    const serialized = JSON.stringify(MOCK_REPORT);
    const deserialized: ForensicReport = JSON.parse(serialized);

    expect(deserialized.caseId).toBe(MOCK_REPORT.caseId);
    expect(deserialized.suspicionScore).toBe(MOCK_REPORT.suspicionScore);
    expect(deserialized.suspects).toHaveLength(3);
    expect(deserialized.narrative?.keyFindings).toHaveLength(3);
    expect(deserialized.graph.nodes).toHaveLength(
      MOCK_REPORT.graph.nodes.length
    );
    expect(deserialized.graph.edges).toHaveLength(
      MOCK_REPORT.graph.edges.length
    );
  });
});
