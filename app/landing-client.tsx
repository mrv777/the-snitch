"use client";

import { useState } from "react";
import { ModeSelector, type InvestigationMode } from "@/components/ModeSelector";
import { TokenInput } from "@/components/TokenInput";
import {
  RecentInvestigations,
  type RecentInvestigation,
} from "@/components/RecentInvestigations";
import Link from "next/link";

interface Props {
  investigations: RecentInvestigation[];
}

export function LandingClient({ investigations }: Props) {
  const [mode, setMode] = useState<InvestigationMode>("token");

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      {/* Agent status bar */}
      <div className="mb-8 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-text-dim">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-green animate-pulse-glow" />
        Agent Status: Active
      </div>

      {/* Hero */}
      <div className="mb-10">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.3em] text-text-dim font-mono">
          On-Chain Forensic Intelligence
        </p>
        <h1 className="text-4xl font-extrabold uppercase tracking-tight font-display sm:text-5xl">
          The{" "}
          <span className="text-accent-green">Snitch</span>
        </h1>
        <p className="mt-3 text-sm text-text-secondary leading-relaxed max-w-lg">
          Detect suspicious trading activity. Trace wallet connections through
          multi-hop graph traversal. Generate shareable intelligence reports.
        </p>
      </div>

      {/* Mode selector */}
      <div className="mb-6">
        <ModeSelector selected={mode} onChange={setMode} />
      </div>

      {/* Mode-specific input */}
      <div className="mb-10">
        {mode === "token" && <TokenInput />}
        {mode === "prediction" && (
          <Link
            href="/investigate/prediction"
            className="block border border-border bg-bg-secondary px-6 py-4 text-center text-sm text-text-secondary hover:bg-bg-card transition-colors"
          >
            Browse recent resolved Polymarket events →
          </Link>
        )}
        {mode === "monitor" && (
          <Link
            href="/monitor"
            className="block border border-border bg-bg-secondary px-6 py-4 text-center text-sm text-text-secondary hover:bg-bg-card transition-colors"
          >
            Open monitoring dashboard →
          </Link>
        )}
      </div>

      {/* Recent investigations */}
      <RecentInvestigations investigations={investigations} />
    </main>
  );
}
