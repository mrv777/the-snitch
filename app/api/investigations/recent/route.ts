import { NextResponse } from "next/server";
import { getRecentInvestigations } from "@/lib/cache/queries";
import type { ForensicReport } from "@/lib/forensics/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = getRecentInvestigations(20);

  const investigations = rows.map((row) => {
    let tokenName: string | undefined;
    let tokenSymbol: string | undefined;

    try {
      const report: ForensicReport = JSON.parse(row.report_json);
      tokenName = report.subject.name;
      tokenSymbol = report.subject.symbol;
    } catch {
      // report_json may be malformed
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
  });

  return NextResponse.json(investigations);
}
