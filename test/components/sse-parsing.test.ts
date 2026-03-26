import { describe, it, expect } from "vitest";
import type { SSEEvent, PhaseProgress, ForensicReport } from "@/lib/forensics/types";
import { MOCK_REPORT } from "../fixtures/forensic-report";

/**
 * Tests for SSE event parsing logic used by InvestigationView.
 * Validates that the event types and data structures match expectations.
 */

function parseSSELine(line: string): SSEEvent | null {
  if (!line.startsWith("data: ")) return null;
  try {
    return JSON.parse(line.slice(6)) as SSEEvent;
  } catch {
    return null;
  }
}

describe("SSE event parsing", () => {
  it("parses phase_start event", () => {
    const event: SSEEvent = {
      type: "phase_start",
      data: { phase: 0, step: "Scanning price history...", complete: false },
    };

    const line = `data: ${JSON.stringify(event)}`;
    const parsed = parseSSELine(line);

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe("phase_start");
    const data = parsed!.data as PhaseProgress;
    expect(data.phase).toBe(0);
    expect(data.step).toBe("Scanning price history...");
    expect(data.complete).toBe(false);
  });

  it("parses phase_complete event", () => {
    const event: SSEEvent = {
      type: "phase_complete",
      data: { phase: 1, step: "Suspects identified", complete: true },
    };

    const line = `data: ${JSON.stringify(event)}`;
    const parsed = parseSSELine(line);

    expect(parsed!.type).toBe("phase_complete");
    const data = parsed!.data as PhaseProgress;
    expect(data.complete).toBe(true);
  });

  it("parses suspects_found event", () => {
    const event: SSEEvent = {
      type: "suspects_found",
      data: { suspects: MOCK_REPORT.suspects } as unknown as Partial<ForensicReport>,
    };

    const line = `data: ${JSON.stringify(event)}`;
    const parsed = parseSSELine(line);

    expect(parsed!.type).toBe("suspects_found");
    const data = parsed!.data as { suspects: typeof MOCK_REPORT.suspects };
    expect(data.suspects).toHaveLength(3);
    expect(data.suspects[0].rank).toBe(1);
  });

  it("parses score_computed event", () => {
    const event: SSEEvent = {
      type: "score_computed",
      data: {
        suspicionScore: 72,
        verdict: "SUSPICIOUS",
      } as Partial<ForensicReport>,
    };

    const line = `data: ${JSON.stringify(event)}`;
    const parsed = parseSSELine(line);

    expect(parsed!.type).toBe("score_computed");
    const data = parsed!.data as Partial<ForensicReport>;
    expect(data.suspicionScore).toBe(72);
    expect(data.verdict).toBe("SUSPICIOUS");
  });

  it("parses report_complete event with full report", () => {
    const event: SSEEvent = {
      type: "report_complete",
      data: MOCK_REPORT,
    };

    const line = `data: ${JSON.stringify(event)}`;
    const parsed = parseSSELine(line);

    expect(parsed!.type).toBe("report_complete");
    const data = parsed!.data as ForensicReport;
    expect(data.caseId).toBe("case-20260323-a1b2");
    expect(data.suspects).toHaveLength(3);
    expect(data.narrative).not.toBeNull();
    expect(data.narrative!.keyFindings).toHaveLength(3);
  });

  it("parses error event", () => {
    const event: SSEEvent = {
      type: "error",
      data: { message: "CREDITS_EXHAUSTED" },
    };

    const line = `data: ${JSON.stringify(event)}`;
    const parsed = parseSSELine(line);

    expect(parsed!.type).toBe("error");
    const data = parsed!.data as { message: string };
    expect(data.message).toBe("CREDITS_EXHAUSTED");
  });

  it("returns null for non-data lines", () => {
    expect(parseSSELine("")).toBeNull();
    expect(parseSSELine("event: ping")).toBeNull();
    expect(parseSSELine(": heartbeat")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseSSELine("data: {invalid json}")).toBeNull();
  });

  it("handles multiple SSE events in a stream", () => {
    const events: SSEEvent[] = [
      { type: "phase_start", data: { phase: 0, step: "Recon...", complete: false } },
      { type: "phase_complete", data: { phase: 0, step: "Done", complete: true } },
      { type: "phase_start", data: { phase: 1, step: "Suspects...", complete: false } },
    ];

    const stream = events.map((e) => `data: ${JSON.stringify(e)}`).join("\n\n");
    const lines = stream.split("\n");
    const parsed = lines
      .map(parseSSELine)
      .filter((e): e is SSEEvent => e !== null);

    expect(parsed).toHaveLength(3);
    expect(parsed[0].type).toBe("phase_start");
    expect(parsed[1].type).toBe("phase_complete");
    expect(parsed[2].type).toBe("phase_start");
  });
});
