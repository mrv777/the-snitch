import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateNarrative,
  buildProgrammaticNarrative,
  buildUserPrompt,
  buildSystemPrompt,
  parseNarrativeResponse,
} from "@/lib/forensics/narrative-generator";
import type {
  ForensicReport,
  AINarrative,
  Suspect,
  EvidenceItem,
  AnomalyWindow,
  SuspectCluster,
  TimelineEvent,
} from "@/lib/forensics/types";
import fixtureResponse from "@/test/fixtures/gemini-narrative-response.json";

// --- Mock @google/genai ---

const mockGenerateContent = vi.fn();

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      models = { generateContent: mockGenerateContent };
    },
    Type: {
      OBJECT: "OBJECT",
      STRING: "STRING",
      ARRAY: "ARRAY",
    },
  };
});

// --- Test Helpers ---

function makeAnomaly(overrides: Partial<AnomalyWindow> = {}): AnomalyWindow {
  return {
    date: "2025-03-15",
    timestamp: 1710500000,
    priceChangePct: 142.5,
    direction: "pump",
    openPrice: 0.05,
    closePrice: 0.12125,
    highPrice: 0.13,
    lowPrice: 0.048,
    volume: 2_300_000,
    ...overrides,
  };
}

function makeSuspect(overrides: Partial<Suspect> = {}): Suspect {
  return {
    address: "0xaaaa000000000000000000000000000000000001",
    entityName: "Shadowy Fund",
    rank: 1,
    score: 200,
    timingAdvantage: 18.5,
    volumeUsd: 580_000,
    action: "buy",
    isDexVisible: true,
    pnlUsd: 1_200_000,
    pnlPercent: 850,
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    factor: "timing",
    weight: 0.3,
    subScore: 80,
    weightedScore: 24,
    description: "Top suspect traded 18.5h before the price move",
    ...overrides,
  };
}

function makeTimeline(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    timestamp: 1710433400,
    relativeLabel: "T-18h",
    type: "suspect_buy",
    actor: "0xaaaa...0001",
    description: "Suspect #1 bought $580K of SHADY",
    volumeUsd: 580_000,
    ...overrides,
  };
}

function makeReport(overrides: Partial<ForensicReport> = {}): ForensicReport {
  return {
    caseId: "case-20250315-a1b2",
    mode: "token",
    subject: {
      address: "0xSHADY0000000000000000000000000000000000",
      name: "ShadyToken",
      symbol: "SHADY",
      chain: "ethereum",
      marketCapUsd: 50_000_000,
      priceUsd: 0.12,
    },
    suspicionScore: 82,
    verdict: "HIGHLY_SUSPICIOUS",
    anomaly: makeAnomaly(),
    suspects: [
      makeSuspect({ rank: 1 }),
      makeSuspect({
        rank: 2,
        address: "0xbbbb000000000000000000000000000000000002",
        entityName: "Unknown Wallet",
        timingAdvantage: 6,
        volumeUsd: 120_000,
        pnlUsd: 280_000,
        pnlPercent: 350,
      }),
    ],
    clusters: [
      {
        suspects: [makeSuspect({ rank: 1 }), makeSuspect({ rank: 2 })],
        connectionType: "same_funding",
        description: "Both trace to same funding source",
      },
    ],
    timeline: [
      makeTimeline(),
      makeTimeline({
        timestamp: 1710500000,
        relativeLabel: "T-0",
        type: "price_move",
        description: "Price pumped +142.5%",
      }),
    ],
    graph: {
      nodes: [
        { id: "0xaaaa000000000000000000000000000000000001", label: "0xaaaa...0001", type: "suspect", suspectRank: 1 },
        { id: "0xbbbb000000000000000000000000000000000002", label: "0xbbbb...0002", type: "suspect", suspectRank: 2 },
      ],
      edges: [
        { source: "0xaaaa000000000000000000000000000000000001", target: "0xbbbb000000000000000000000000000000000002", type: "funding" },
      ],
    },
    evidence: [
      makeEvidence({ factor: "timing", subScore: 80, weightedScore: 24, weight: 0.3 }),
      makeEvidence({ factor: "volume_concentration", subScore: 70, weightedScore: 14, weight: 0.2 }),
      makeEvidence({ factor: "wallet_connections", subScore: 100, weightedScore: 20, weight: 0.2 }),
      makeEvidence({ factor: "smart_money_labels", subScore: 60, weightedScore: 9, weight: 0.15 }),
      makeEvidence({ factor: "profit_magnitude", subScore: 100, weightedScore: 15, weight: 0.15 }),
    ],
    narrative: null,
    metadata: {
      creditsUsed: 450,
      phasesCompleted: [0, 1, 2],
      duration: 35_000,
      createdAt: 1710500100,
      earlyExit: false,
      degradedSections: [],
    },
    ...overrides,
  };
}

// --- Tests ---

describe("narrative-generator", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash");
    mockGenerateContent.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("parseNarrativeResponse", () => {
    it("parses valid fixture response", () => {
      const result = parseNarrativeResponse(
        JSON.stringify(fixtureResponse),
        "HIGHLY SUSPICIOUS"
      );

      expect(result.caseNarrative).toContain("$SHADY");
      expect(result.keyFindings).toHaveLength(3);
      expect(result.shareableLine.length).toBeLessThanOrEqual(120);
      expect(result.verdictLabel).toBe("HIGHLY SUSPICIOUS");
    });

    it("enforces exactly 3 key findings (truncates excess)", () => {
      const input = {
        ...fixtureResponse,
        keyFindings: ["A", "B", "C", "D", "E"],
      };
      const result = parseNarrativeResponse(
        JSON.stringify(input),
        "SUSPICIOUS"
      );
      expect(result.keyFindings).toHaveLength(3);
    });

    it("pads to 3 key findings when fewer provided", () => {
      const input = {
        ...fixtureResponse,
        keyFindings: ["Only one finding"],
      };
      const result = parseNarrativeResponse(
        JSON.stringify(input),
        "SUSPICIOUS"
      );
      expect(result.keyFindings).toHaveLength(3);
      expect(result.keyFindings[1]).toBe("Further investigation recommended");
    });

    it("truncates key findings over 100 chars", () => {
      const longFinding = "A".repeat(150);
      const input = {
        ...fixtureResponse,
        keyFindings: [longFinding, "Short", "Also short"],
      };
      const result = parseNarrativeResponse(
        JSON.stringify(input),
        "NOTABLE"
      );
      expect(result.keyFindings[0].length).toBeLessThanOrEqual(100);
      expect(result.keyFindings[0].endsWith("...")).toBe(true);
    });

    it("truncates shareable line over 120 chars", () => {
      const input = {
        ...fixtureResponse,
        shareableLine: "X".repeat(200),
      };
      const result = parseNarrativeResponse(
        JSON.stringify(input),
        "CLEAN"
      );
      expect(result.shareableLine.length).toBeLessThanOrEqual(120);
    });

    it("forces verdict to match expected", () => {
      const input = {
        ...fixtureResponse,
        verdictLabel: "WRONG VERDICT",
      };
      const result = parseNarrativeResponse(
        JSON.stringify(input),
        "CLEAN"
      );
      expect(result.verdictLabel).toBe("CLEAN");
    });

    it("throws on missing caseNarrative", () => {
      const input = { ...fixtureResponse, caseNarrative: "" };
      expect(() =>
        parseNarrativeResponse(JSON.stringify(input), "CLEAN")
      ).toThrow("Missing or invalid caseNarrative");
    });

    it("throws on missing keyFindings", () => {
      const input = { ...fixtureResponse, keyFindings: [] };
      expect(() =>
        parseNarrativeResponse(JSON.stringify(input), "CLEAN")
      ).toThrow("Missing or empty keyFindings");
    });

    it("throws on invalid JSON", () => {
      expect(() =>
        parseNarrativeResponse("not json at all", "CLEAN")
      ).toThrow();
    });
  });

  describe("buildUserPrompt", () => {
    it("includes token info and suspicion score", () => {
      const report = makeReport();
      const prompt = buildUserPrompt(report);

      expect(prompt).toContain("ShadyToken");
      expect(prompt).toContain("SHADY");
      expect(prompt).toContain("ethereum");
      expect(prompt).toContain("82/100");
      expect(prompt).toContain("HIGHLY SUSPICIOUS");
    });

    it("includes anomaly data when present", () => {
      const report = makeReport();
      const prompt = buildUserPrompt(report);

      expect(prompt).toContain("2025-03-15");
      expect(prompt).toContain("PUMP");
      expect(prompt).toContain("+142.5%");
    });

    it("includes suspect details", () => {
      const report = makeReport();
      const prompt = buildUserPrompt(report);

      expect(prompt).toContain("Suspect #1");
      expect(prompt).toContain("Shadowy Fund");
      expect(prompt).toContain("18.5h");
      expect(prompt).toContain("$580.0K");
    });

    it("includes evidence breakdown", () => {
      const report = makeReport();
      const prompt = buildUserPrompt(report);

      expect(prompt).toContain("timing: 80/100");
      expect(prompt).toContain("volume concentration: 70/100");
    });

    it("includes cluster info", () => {
      const report = makeReport();
      const prompt = buildUserPrompt(report);

      expect(prompt).toContain("same funding");
    });

    it("includes timeline events", () => {
      const report = makeReport();
      const prompt = buildUserPrompt(report);

      expect(prompt).toContain("[T-18h]");
      expect(prompt).toContain("[T-0]");
    });

    it("handles report with no anomaly (CLEAN)", () => {
      const report = makeReport({
        anomaly: null,
        suspects: [],
        clusters: [],
        timeline: [],
        evidence: [],
        suspicionScore: 5,
        verdict: "CLEAN",
      });
      const prompt = buildUserPrompt(report);

      expect(prompt).toContain("CLEAN");
      expect(prompt).not.toContain("ANOMALY DETECTED");
    });
  });

  describe("buildSystemPrompt", () => {
    it("contains required tone instructions", () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toContain("The Snitch");
      expect(prompt).toContain("HIGH scores (80+)");
      expect(prompt).toContain("MEDIUM scores (40-79)");
      expect(prompt).toContain("LOW scores (0-39)");
      expect(prompt).toContain("Never accuse directly");
    });
  });

  describe("buildProgrammaticNarrative", () => {
    it("generates narrative for HIGHLY_SUSPICIOUS report", () => {
      const report = makeReport();
      const narrative = buildProgrammaticNarrative(report);

      expect(narrative.caseNarrative).toContain("ShadyToken");
      expect(narrative.caseNarrative).toContain("SHADY");
      expect(narrative.caseNarrative).toContain("+142.5%");
      expect(narrative.caseNarrative).toContain("pump");
      expect(narrative.keyFindings).toHaveLength(3);
      expect(narrative.keyFindings.every((f) => f.length <= 100)).toBe(true);
      expect(narrative.shareableLine.length).toBeLessThanOrEqual(120);
      expect(narrative.verdictLabel).toBe("HIGHLY SUSPICIOUS");
    });

    it("generates narrative for CLEAN report", () => {
      const report = makeReport({
        anomaly: null,
        suspects: [],
        clusters: [],
        evidence: [],
        suspicionScore: 5,
        verdict: "CLEAN",
      });
      const narrative = buildProgrammaticNarrative(report);

      expect(narrative.caseNarrative).toContain("no significant anomalous");
      expect(narrative.verdictLabel).toBe("CLEAN");
      expect(narrative.keyFindings).toHaveLength(3);
    });

    it("includes suspect PnL when available", () => {
      const report = makeReport();
      const narrative = buildProgrammaticNarrative(report);

      expect(narrative.caseNarrative).toContain("$1.2M");
      expect(narrative.caseNarrative).toContain("+850.0%");
    });

    it("includes top evidence factors", () => {
      const report = makeReport();
      const narrative = buildProgrammaticNarrative(report);

      expect(narrative.caseNarrative).toContain("timing");
    });

    it("pads key findings to 3", () => {
      const report = makeReport({
        anomaly: null,
        suspects: [],
        evidence: [],
      });
      const narrative = buildProgrammaticNarrative(report);
      expect(narrative.keyFindings).toHaveLength(3);
    });
  });

  describe("generateNarrative", () => {
    it("returns AI narrative on successful primary model call", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(fixtureResponse),
      });

      const report = makeReport();
      const narrative = await generateNarrative(report);

      expect(narrative.caseNarrative).toContain("$SHADY");
      expect(narrative.keyFindings).toHaveLength(3);
      expect(narrative.verdictLabel).toBe("HIGHLY SUSPICIOUS");
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it("retries on first failure, succeeds on second", async () => {
      mockGenerateContent
        .mockRejectedValueOnce(new Error("rate limited"))
        .mockResolvedValueOnce({
          text: JSON.stringify(fixtureResponse),
        });

      const report = makeReport();
      const narrative = await generateNarrative(report);

      expect(narrative.verdictLabel).toBe("HIGHLY SUSPICIOUS");
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it("falls back to fallback model after 2 primary failures", async () => {
      mockGenerateContent
        .mockRejectedValueOnce(new Error("primary fail 1"))
        .mockRejectedValueOnce(new Error("primary fail 2"))
        .mockResolvedValueOnce({
          text: JSON.stringify(fixtureResponse),
        });

      const report = makeReport();
      const narrative = await generateNarrative(report);

      expect(narrative.verdictLabel).toBe("HIGHLY SUSPICIOUS");
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    it("falls back to programmatic narrative when all AI fails", async () => {
      mockGenerateContent
        .mockRejectedValueOnce(new Error("fail 1"))
        .mockRejectedValueOnce(new Error("fail 2"))
        .mockRejectedValueOnce(new Error("fail 3"));

      const report = makeReport();
      const narrative = await generateNarrative(report);

      // Should still return a valid narrative (programmatic fallback)
      expect(narrative.caseNarrative).toContain("ShadyToken");
      expect(narrative.keyFindings).toHaveLength(3);
      expect(narrative.verdictLabel).toBe("HIGHLY SUSPICIOUS");
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    it("falls back to programmatic on malformed JSON response", async () => {
      mockGenerateContent
        .mockResolvedValueOnce({ text: "not valid json" })
        .mockResolvedValueOnce({ text: "still not json" })
        .mockResolvedValueOnce({ text: "nope" });

      const report = makeReport();
      const narrative = await generateNarrative(report);

      // Programmatic fallback
      expect(narrative.caseNarrative).toContain("ShadyToken");
      expect(narrative.keyFindings).toHaveLength(3);
    });

    it("falls back to programmatic on empty response", async () => {
      mockGenerateContent
        .mockResolvedValueOnce({ text: "" })
        .mockResolvedValueOnce({ text: null })
        .mockResolvedValueOnce({ text: undefined });

      const report = makeReport();
      const narrative = await generateNarrative(report);

      expect(narrative.caseNarrative).toBeTruthy();
      expect(narrative.keyFindings).toHaveLength(3);
    });

    it("handles different verdict levels correctly", async () => {
      const verdicts = [
        { verdict: "CLEAN" as const, score: 10, expected: "CLEAN" },
        { verdict: "INCONCLUSIVE" as const, score: 25, expected: "INCONCLUSIVE" },
        { verdict: "NOTABLE" as const, score: 50, expected: "NOTABLE" },
        { verdict: "SUSPICIOUS" as const, score: 65, expected: "SUSPICIOUS" },
      ];

      for (const v of verdicts) {
        mockGenerateContent.mockRejectedValue(new Error("force fallback"));

        const report = makeReport({
          suspicionScore: v.score,
          verdict: v.verdict,
        });
        const narrative = await generateNarrative(report);

        expect(narrative.verdictLabel).toBe(v.expected);
      }
    });
  });
});
