import type { Metadata } from "next";
import { getInvestigationBySubject } from "@/lib/cache/queries";
import type { ForensicReport } from "@/lib/forensics/types";
import { PredictionInvestigationView } from "./investigation-view";

const siteUrl = process.env.SITE_URL || "https://thesnitch.xyz";

interface PageProps {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ marketId?: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { eventId } = await params;
  const decodedId = decodeURIComponent(eventId);

  // Try to get cached report for richer metadata
  const cached = getInvestigationBySubject(decodedId, "prediction");
  if (cached) {
    try {
      const report: ForensicReport = JSON.parse(cached.report_json);
      const title = `${report.subject.eventTitle || report.subject.name} — ${report.verdict?.replace("_", " ") ?? "Investigation"} | The Snitch`;
      const description =
        report.narrative?.shareableLine ??
        `Prediction market investigation of ${decodedId}`;

      return {
        title,
        description,
        openGraph: {
          title,
          description,
          url: `${siteUrl}/investigate/prediction/${encodeURIComponent(decodedId)}`,
          images: report.caseId
            ? [`${siteUrl}/api/og/${report.caseId}?variant=forensic`]
            : undefined,
        },
        twitter: {
          card: "summary_large_image",
          title,
          description,
        },
      };
    } catch {
      // Fall through to default
    }
  }

  return {
    title: `Prediction Market Investigation | The Snitch`,
    description: `Prediction market forensic investigation — did someone know?`,
    openGraph: {
      title: `Prediction Market Investigation | The Snitch`,
      description: `Prediction market forensic investigation — did someone know?`,
      url: `${siteUrl}/investigate/prediction/${encodeURIComponent(decodedId)}`,
    },
    twitter: {
      card: "summary_large_image",
    },
  };
}

export default async function PredictionInvestigationPage({
  params,
  searchParams,
}: PageProps) {
  const { eventId } = await params;
  const { marketId } = await searchParams;
  const decodedId = decodeURIComponent(eventId);

  // Check for cached report
  let cachedReport: ForensicReport | null = null;
  const cached = getInvestigationBySubject(decodedId, "prediction");
  if (cached) {
    try {
      cachedReport = JSON.parse(cached.report_json);
    } catch {
      // ignore
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PredictionInvestigationView
        eventId={decodedId}
        marketId={marketId}
        cachedReport={cachedReport}
        siteUrl={siteUrl}
      />
    </main>
  );
}
