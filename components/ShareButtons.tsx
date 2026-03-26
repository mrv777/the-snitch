"use client";

import { useState } from "react";

interface Props {
  caseId: string;
  shareableLine: string;
  tokenSymbol: string;
  siteUrl: string;
}

export function ShareButtons({
  caseId,
  shareableLine,
  tokenSymbol,
  siteUrl,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const investigationUrl = `${siteUrl}/investigate/token/${caseId}`;

  const tweetText = encodeURIComponent(
    `${shareableLine}\n\nFull forensic report on $${tokenSymbol}:`
  );
  const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(investigationUrl)}&hashtags=NansenCLI`;

  async function handleCopyLink() {
    await navigator.clipboard.writeText(investigationUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/og/${encodeURIComponent(caseId)}`);
      if (!res.ok) throw new Error("Failed to fetch image");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `snitch-${caseId}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      await handleCopyLink();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 bg-white px-5 py-3 text-xs font-bold uppercase tracking-wider text-black transition-all hover:bg-gray-200 active:scale-[0.98]"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Share on X
      </a>

      <button
        onClick={handleDownload}
        className="flex items-center gap-2 border border-border bg-bg-secondary px-5 py-3 text-xs text-text-primary transition-all hover:bg-bg-card"
      >
        {downloading ? "Saving..." : "Download Card"}
      </button>

      <button
        onClick={handleCopyLink}
        className="flex items-center gap-2 border border-border bg-bg-secondary px-5 py-3 text-xs text-text-primary transition-all hover:bg-bg-card"
      >
        {copied ? "Copied!" : "Copy Link"}
      </button>
    </div>
  );
}
