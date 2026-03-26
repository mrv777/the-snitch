import { getInvestigationById } from "@/lib/cache/queries";
import type { ForensicReport } from "@/lib/forensics/types";
import { ForensicCard } from "./forensic-card";
import { TimelineCard } from "./timeline-card";

interface Props {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ variant?: string }>;
}

export default async function CardRenderPage({ params, searchParams }: Props) {
  const { caseId } = await params;
  const { variant = "forensic" } = await searchParams;
  const siteName = process.env.SITE_NAME || "thesnitch.xyz";

  const cached = getInvestigationById(caseId);
  if (!cached) {
    return <FallbackCard caseId={caseId} siteName={siteName} />;
  }

  const report: ForensicReport = JSON.parse(cached.report_json);

  if (variant === "timeline") {
    return <TimelineCard report={report} siteName={siteName} />;
  }

  return <ForensicCard report={report} siteName={siteName} />;
}

function FallbackCard({
  caseId,
  siteName,
}: {
  caseId: string;
  siteName: string;
}) {
  const caseNumber = caseId.replace("case-", "#");

  return (
    <div
      style={{
        width: 1200,
        height: 630,
        background: "#0C0C0C",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        fontFamily: "'JetBrains Mono', monospace",
        color: "#E0E0E0",
        padding: "48px 64px",
        position: "relative",
      }}
    >
      <div
        style={{
          height: 6,
          background: "#00FF88",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
        }}
      />
      <div
        style={{
          fontSize: 13,
          letterSpacing: "0.25em",
          color: "rgba(255,255,255,0.25)",
          textTransform: "uppercase",
          marginBottom: 24,
        }}
      >
        {siteName}
      </div>
      <div
        style={{
          fontFamily: "Syne, sans-serif",
          fontSize: 56,
          fontWeight: 800,
          textTransform: "uppercase",
          lineHeight: 0.9,
          color: "#00FF88",
          marginBottom: 24,
        }}
      >
        THE SNITCH
      </div>
      <div style={{ fontSize: 18, color: "rgba(255,255,255,0.4)" }}>
        Case {caseNumber} — Investigation in progress
      </div>
    </div>
  );
}
