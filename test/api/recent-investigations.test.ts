import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ForensicReport } from "@/lib/forensics/types";
import { MOCK_REPORT, MOCK_CLEAN_REPORT } from "../fixtures/forensic-report";
import type { SavedInvestigation } from "@/lib/cache/queries";

/**
 * Tests for the recent investigations API response format.
 * Uses fixture data to validate the transform from SavedInvestigation to API response.
 */

// Simulate what the API route does: transform SavedInvestigation rows to the response format
function transformInvestigation(row: SavedInvestigation) {
  let tokenName: string | undefined;
  let tokenSymbol: string | undefined;

  try {
    const report: ForensicReport = JSON.parse(row.report_json);
    tokenName = report.subject.name;
    tokenSymbol = report.subject.symbol;
  } catch {
    // ignore
  }

  return {
    id: row.id,
    mode: row.mode,
    subject_id: row.subject_id,
    chain: row.chain,
    suspicion_score: row.suspicion_score,
    verdict: row.verdict,
    created_at: row.created_at,
    token_name: tokenName,
    token_symbol: tokenSymbol,
  };
}

function makeRow(report: ForensicReport): SavedInvestigation {
  return {
    id: report.caseId,
    mode: report.mode,
    subject_id: report.subject.address.toLowerCase(),
    chain: report.subject.chain,
    suspicion_score: report.suspicionScore,
    verdict: report.verdict,
    report_json: JSON.stringify(report),
    card_path: null,
    timeline_card_path: null,
    created_at: report.metadata.createdAt,
  };
}

describe("recent investigations API transform", () => {
  it("extracts token name and symbol from report JSON", () => {
    const row = makeRow(MOCK_REPORT);
    const result = transformInvestigation(row);

    expect(result.token_name).toBe("Pepe");
    expect(result.token_symbol).toBe("PEPE");
  });

  it("preserves score and verdict", () => {
    const row = makeRow(MOCK_REPORT);
    const result = transformInvestigation(row);

    expect(result.suspicion_score).toBe(72);
    expect(result.verdict).toBe("SUSPICIOUS");
  });

  it("handles clean report", () => {
    const row = makeRow(MOCK_CLEAN_REPORT);
    const result = transformInvestigation(row);

    expect(result.suspicion_score).toBe(0);
    expect(result.verdict).toBe("CLEAN");
    expect(result.token_symbol).toBe("USDC");
  });

  it("handles malformed report_json gracefully", () => {
    const row = makeRow(MOCK_REPORT);
    row.report_json = "not valid json";
    const result = transformInvestigation(row);

    expect(result.token_name).toBeUndefined();
    expect(result.token_symbol).toBeUndefined();
    expect(result.id).toBe(MOCK_REPORT.caseId);
  });

  it("lowercases subject_id", () => {
    const row = makeRow(MOCK_REPORT);
    expect(row.subject_id).toBe(MOCK_REPORT.subject.address.toLowerCase());
  });
});
