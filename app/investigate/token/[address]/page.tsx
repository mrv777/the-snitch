import type { Metadata } from "next";
import { getInvestigationBySubject } from "@/lib/cache/queries";
import { truncateAddress } from "@/lib/utils/address";
import type { ForensicReport } from "@/lib/forensics/types";
import { InvestigationView } from "./investigation-view";

const siteUrl = process.env.SITE_URL || "https://thesnitch.xyz";

interface PageProps {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ chain?: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { address } = await params;
  const tokenAddress = decodeURIComponent(address);
  const displayAddress = truncateAddress(tokenAddress);

  // Try to get cached report for richer metadata
  const cached = getInvestigationBySubject(tokenAddress, "token");
  if (cached) {
    try {
      const report: ForensicReport = JSON.parse(cached.report_json);
      const title = `$${report.subject.symbol} — ${report.verdict?.replace("_", " ") ?? "Investigation"} | The Snitch`;
      const description =
        report.narrative?.shareableLine ??
        `Forensic investigation of ${displayAddress}`;

      return {
        title,
        description,
        openGraph: {
          title,
          description,
          url: `${siteUrl}/investigate/token/${encodeURIComponent(tokenAddress)}`,
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
    title: `${displayAddress} — Token Investigation | The Snitch`,
    description: `On-chain forensic investigation of ${displayAddress}`,
    openGraph: {
      title: `${displayAddress} — Token Investigation | The Snitch`,
      description: `On-chain forensic investigation of ${displayAddress}`,
      url: `${siteUrl}/investigate/token/${encodeURIComponent(tokenAddress)}`,
    },
    twitter: {
      card: "summary_large_image",
    },
  };
}

export default async function TokenInvestigationPage({
  params,
  searchParams,
}: PageProps) {
  const { address } = await params;
  const { chain } = await searchParams;
  const tokenAddress = decodeURIComponent(address);
  const selectedChain = chain || "ethereum";

  // Check for cached report
  let cachedReport: ForensicReport | null = null;
  const cached = getInvestigationBySubject(tokenAddress, "token");
  if (cached) {
    try {
      cachedReport = JSON.parse(cached.report_json);
    } catch {
      // ignore
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <InvestigationView
        tokenAddress={tokenAddress}
        chain={selectedChain}
        cachedReport={cachedReport}
        siteUrl={siteUrl}
      />
    </main>
  );
}
