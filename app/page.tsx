import { getRecentInvestigations } from "@/lib/cache/queries";
import type { ForensicReport } from "@/lib/forensics/types";
import { LandingClient } from "./landing-client";
import type { RecentInvestigation } from "@/components/RecentInvestigations";

function loadRecentInvestigations(): RecentInvestigation[] {
  try {
    const rows = getRecentInvestigations(20);
    return rows.map((row) => {
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
    });
  } catch {
    return [];
  }
}

export default function Home() {
  const investigations = loadRecentInvestigations();

  return <LandingClient investigations={investigations} />;
}
