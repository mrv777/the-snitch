"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type {
  ForensicReport,
  InvestigationPhase,
  SSEEvent,
  PhaseProgress,
  Suspect,
} from "@/lib/forensics/types";
import { VERDICT_CONFIG } from "@/lib/forensics/types";
import { truncateAddress } from "@/lib/utils/address";
import { formatCompactUsd, formatPercent, formatDate } from "@/lib/utils/format";
import { InvestigationLoading } from "@/components/InvestigationLoading";
import { SuspicionMeter } from "@/components/SuspicionMeter";
import { ForensicTimeline } from "@/components/ForensicTimeline";
import { WalletGraphViz } from "@/components/WalletGraph";
import { EvidenceCards } from "@/components/EvidenceCard";
import { CaseNarrative } from "@/components/CaseNarrative";
import { ShareButtons } from "@/components/ShareButtons";

interface Props {
  tokenAddress: string;
  chain: string;
  cachedReport: ForensicReport | null;
  siteUrl: string;
}

type ViewState = "loading" | "investigating" | "complete" | "error";

export function InvestigationView({
  tokenAddress,
  chain,
  cachedReport,
  siteUrl,
}: Props) {
  const [state, setState] = useState<ViewState>(
    cachedReport ? "complete" : "loading"
  );
  const [report, setReport] = useState<ForensicReport | null>(cachedReport);
  const [currentPhase, setCurrentPhase] = useState<InvestigationPhase>(0);
  const [currentStep, setCurrentStep] = useState("");
  const [completedPhases, setCompletedPhases] = useState<InvestigationPhase[]>(
    []
  );
  const [suspects, setSuspects] = useState<Suspect[]>([]);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController>(null);

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case "phase_start": {
        const data = event.data as PhaseProgress;
        setCurrentPhase(data.phase);
        setCurrentStep(data.step);
        break;
      }
      case "phase_complete": {
        const data = event.data as PhaseProgress;
        setCompletedPhases((prev) =>
          prev.includes(data.phase) ? prev : [...prev, data.phase]
        );
        break;
      }
      case "step_update": {
        const data = event.data as PhaseProgress;
        setCurrentStep(data.step);
        break;
      }
      case "suspects_found": {
        const data = event.data as { suspects: Suspect[] };
        setSuspects(data.suspects);
        break;
      }
      case "score_computed": {
        const data = event.data as Partial<ForensicReport>;
        setReport((prev) =>
          prev
            ? {
                ...prev,
                suspicionScore: data.suspicionScore ?? prev.suspicionScore,
                verdict: data.verdict ?? prev.verdict,
              }
            : null
        );
        break;
      }
      case "report_complete": {
        const data = event.data as ForensicReport;
        setReport(data);
        setState("complete");
        break;
      }
      case "error": {
        const data = event.data as { message: string };
        setError(data.message);
        setState("error");
        break;
      }
    }
  }, []);

  useEffect(() => {
    if (cachedReport) return;

    const controller = new AbortController();
    abortRef.current = controller;

    // Safety timeout — if the SSE stream stalls (e.g., serverless function killed),
    // surface an error rather than leaving the user on a spinner forever.
    const streamTimeout = setTimeout(() => {
      controller.abort();
      setError("Investigation timed out. The server may be under heavy load — try again later.");
      setState("error");
    }, 90_000);

    async function startInvestigation() {
      setState("investigating");

      try {
        const res = await fetch(
          `/api/investigate/token/${encodeURIComponent(tokenAddress)}?chain=${chain}`,
          {
            method: "POST",
            signal: controller.signal,
          }
        );

        // Non-SSE response (cached JSON or error)
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          clearTimeout(streamTimeout);
          const data = await res.json();
          if (res.ok) {
            setReport(data);
            setState("complete");
          } else {
            setError(data.message || "Investigation failed");
            setState("error");
          }
          return;
        }

        // SSE stream
        const reader = res.body?.getReader();
        if (!reader) {
          setError("Failed to connect to investigation stream");
          setState("error");
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event: SSEEvent = JSON.parse(line.slice(6));
                handleSSEEvent(event);
              } catch {
                // Skip malformed SSE events
              }
            }
          }
        }
        clearTimeout(streamTimeout);
      } catch (err) {
        clearTimeout(streamTimeout);
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : "Investigation failed"
        );
        setState("error");
      }
    }

    startInvestigation();

    return () => {
      clearTimeout(streamTimeout);
      controller.abort();
    };
  }, [tokenAddress, chain, cachedReport, handleSSEEvent]);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/"
          className="text-[11px] uppercase tracking-[0.2em] text-text-dim hover:text-accent-green transition-colors"
        >
          ← Back to The Snitch
        </Link>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold font-display uppercase tracking-tight">
              {report?.subject.symbol && report.subject.symbol !== "???"
                ? `$${report.subject.symbol}`
                : truncateAddress(tokenAddress)}
            </h1>
            <p className="mt-1 text-xs font-mono text-text-dim">
              {tokenAddress}
            </p>
            <div className="mt-1 flex gap-2 text-[10px] uppercase text-text-dim">
              <span>{chain}</span>
              {report?.caseId && (
                <>
                  <span>·</span>
                  <span>{report.caseId}</span>
                </>
              )}
              {report?.metadata.createdAt && (
                <>
                  <span>·</span>
                  <span>{formatDate(report.metadata.createdAt)}</span>
                </>
              )}
            </div>
          </div>

          {report?.subject.marketCapUsd && (
            <div className="text-right">
              <p className="text-[10px] uppercase text-text-dim">Market Cap</p>
              <p className="text-sm font-mono text-text-secondary">
                {formatCompactUsd(report.subject.marketCapUsd)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Investigation in progress */}
      {state === "investigating" && (
        <div className="py-16">
          <InvestigationLoading
            currentPhase={currentPhase}
            currentStep={currentStep}
            completedPhases={completedPhases}
          />

          {/* Show suspects as they're found */}
          {suspects.length > 0 && (
            <div className="mt-8 animate-fade-in">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">
                Suspects Identified
              </p>
              <div className="space-y-1">
                {suspects.map((s) => (
                  <div
                    key={s.address}
                    className="flex items-center gap-3 text-xs"
                  >
                    <span className="text-verdict-red font-bold">
                      #{s.rank}
                    </span>
                    <span className="font-mono text-text-secondary">
                      {truncateAddress(s.address)}
                    </span>
                    {s.entityName && (
                      <span className="text-text-dim">{s.entityName}</span>
                    )}
                    <span className="text-text-dim">
                      {formatCompactUsd(s.volumeUsd)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div className="py-16 text-center">
          <p className="text-sm text-verdict-red mb-4">{error}</p>
          {error.includes("CREDITS_EXHAUSTED") ? (
            <p className="text-xs text-text-dim">
              Daily credit budget exhausted. Browse existing reports on the
              homepage.
            </p>
          ) : error.includes("rate_limited") || error.includes("Rate limited") ? (
            <p className="text-xs text-text-dim">
              You&apos;ve reached the daily investigation limit. Cached reports
              remain accessible.
            </p>
          ) : (
            <Link
              href="/"
              className="text-xs text-text-secondary hover:text-accent-green"
            >
              ← Try another token
            </Link>
          )}
        </div>
      )}

      {/* Complete report */}
      {state === "complete" && report && (
        <div className="space-y-8">
          {/* Anomaly banner */}
          {report.anomaly && (
            <div
              className="border px-4 py-3 animate-fade-in"
              style={{
                borderColor: `${VERDICT_CONFIG[report.verdict].color}40`,
                backgroundColor: `${VERDICT_CONFIG[report.verdict].color}08`,
              }}
            >
              <p className="text-xs text-text-secondary">
                {report.anomaly.direction === "pump" ? "Price pump" : "Price dump"}{" "}
                of{" "}
                <span
                  className="font-bold"
                  style={{ color: VERDICT_CONFIG[report.verdict].color }}
                >
                  {formatPercent(report.anomaly.priceChangePct)}
                </span>{" "}
                detected on {formatDate(report.anomaly.timestamp)}
              </p>
            </div>
          )}

          {/* Early exit clean report */}
          {report.metadata.earlyExit && (
            <div className="border border-verdict-green/20 bg-verdict-green/5 px-4 py-3 animate-fade-in">
              <p className="text-xs text-text-secondary">
                No significant price anomalies detected in the last 90 days.
                This token appears clean.
              </p>
            </div>
          )}

          {/* Suspicion meter */}
          <SuspicionMeter score={report.suspicionScore} verdict={report.verdict} />

          {/* Suspects summary */}
          {report.suspects.length > 0 && (
            <div className="animate-fade-in">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">
                Top Suspects
              </p>
              <div className="space-y-2 stagger-fade-in">
                {report.suspects.map((suspect) => (
                  <div
                    key={suspect.address}
                    className="border border-border bg-bg-secondary px-4 py-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-verdict-red">
                          #{suspect.rank}
                        </span>
                        <span className="text-sm font-mono text-text-primary">
                          {truncateAddress(suspect.address)}
                        </span>
                        {suspect.entityName && (
                          <span className="text-xs text-text-dim">
                            {suspect.entityName}
                          </span>
                        )}
                        {suspect.label && (
                          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-accent-blue/30 text-accent-blue">
                            {suspect.label}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold uppercase text-text-dim">
                        {suspect.action}
                      </span>
                    </div>
                    <div className="flex gap-4 text-[11px] text-text-dim">
                      <span>
                        Volume: {formatCompactUsd(suspect.volumeUsd)}
                      </span>
                      <span>
                        Timing: T-{Math.round(suspect.timingAdvantage)}h
                      </span>
                      {suspect.pnlUsd !== undefined && (
                        <span>PnL: {formatCompactUsd(suspect.pnlUsd)}</span>
                      )}
                      {suspect.winRate !== undefined && (
                        <span>Win rate: {formatPercent(suspect.winRate)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Clusters */}
              {report.clusters.length > 0 && (
                <div className="mt-3 space-y-1">
                  {report.clusters.map((cluster, i) => (
                    <p
                      key={i}
                      className="text-xs text-verdict-amber flex items-center gap-2"
                    >
                      <span>&#9888;</span>
                      {cluster.description}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Forensic timeline */}
          <ForensicTimeline events={report.timeline} />

          {/* Wallet graph */}
          <WalletGraphViz graph={report.graph} />

          {/* Evidence */}
          <EvidenceCards evidence={report.evidence} />

          {/* AI Narrative */}
          {report.narrative && <CaseNarrative narrative={report.narrative} />}

          {/* Share */}
          <div className="pt-4 border-t border-border animate-fade-in">
            <ShareButtons
              caseId={report.caseId}
              shareableLine={
                report.narrative?.shareableLine ??
                `Investigation of ${report.subject.symbol}`
              }
              tokenSymbol={report.subject.symbol}
              siteUrl={siteUrl}
            />
          </div>

          {/* Metadata footer */}
          <div className="flex flex-wrap gap-4 text-[10px] text-text-dim">
            <span>Credits used: {report.metadata.creditsUsed}</span>
            <span>
              Duration: {(report.metadata.duration / 1000).toFixed(1)}s
            </span>
            <span>
              Phases: {report.metadata.phasesCompleted.length}
            </span>
            {report.metadata.degradedSections.length > 0 && (
              <span className="text-verdict-amber">
                Degraded: {report.metadata.degradedSections.join(", ")}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Loading initial state */}
      {state === "loading" && (
        <div className="py-16 text-center text-sm text-text-dim">
          Initializing investigation...
        </div>
      )}
    </div>
  );
}
