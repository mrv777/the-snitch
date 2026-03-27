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
import { EvidenceCards } from "@/components/EvidenceCard";
import { CaseNarrative } from "@/components/CaseNarrative";
import { ShareButtons } from "@/components/ShareButtons";

interface Props {
  eventId: string;
  marketId?: string;
  cachedReport: ForensicReport | null;
  siteUrl: string;
}

type ViewState = "loading" | "investigating" | "complete" | "error";

// PM-specific phase labels
const PM_PHASE_LABELS: Record<InvestigationPhase, { active: string; complete: string }> = {
  0: { active: "Discovering event details...", complete: "Event identified" },
  1: { active: "Analyzing market profits...", complete: "Profiters identified" },
  2: { active: "Tracing profiter wallets...", complete: "Wallet tracing complete" },
  3: { active: "Computing insider score...", complete: "Report complete" },
};

export function PredictionInvestigationView({
  eventId,
  marketId,
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
  const [profiters, setProfiters] = useState<Suspect[]>([]);
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
        setProfiters(data.suspects);
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
        const url = new URL(
          `/api/investigate/prediction/${encodeURIComponent(eventId)}`,
          window.location.origin
        );
        if (marketId) url.searchParams.set("marketId", marketId);

        const res = await fetch(url.toString(), {
          method: "POST",
          signal: controller.signal,
        });

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
  }, [eventId, marketId, cachedReport, handleSSEEvent]);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/investigate/prediction"
          className="text-[11px] uppercase tracking-[0.2em] text-text-dim hover:text-accent-green transition-colors"
        >
          ← Back to Event Browser
        </Link>

        <div className="mt-4">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.3em] text-text-dim font-mono">
            Prediction Market Forensics
          </p>
          {report?.subject.eventTitle ? (
            <h1 className="text-xl font-extrabold font-display uppercase tracking-tight">
              {report.subject.eventTitle}
            </h1>
          ) : (
            <h1 className="text-xl font-extrabold font-display uppercase tracking-tight">
              Event Investigation
            </h1>
          )}
          <div className="mt-1 flex flex-wrap gap-2 text-[10px] uppercase text-text-dim">
            <span className="font-mono">{eventId.slice(0, 16)}...</span>
            {report?.subject.outcome && (
              <>
                <span>·</span>
                <span className="text-accent-green">
                  Outcome: {report.subject.outcome}
                </span>
              </>
            )}
            {report?.subject.resolutionDate && (
              <>
                <span>·</span>
                <span>
                  Resolved:{" "}
                  {formatDate(
                    Math.floor(
                      Date.parse(report.subject.resolutionDate) / 1000
                    )
                  )}
                </span>
              </>
            )}
            {report?.caseId && (
              <>
                <span>·</span>
                <span>{report.caseId}</span>
              </>
            )}
          </div>
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

          {/* Show profiters as they're found */}
          {profiters.length > 0 && (
            <div className="mt-8 animate-fade-in">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">
                Top Profiters Identified
              </p>
              <div className="space-y-1">
                {profiters.map((p) => (
                  <div
                    key={p.address}
                    className="flex items-center gap-3 text-xs"
                  >
                    <span className="text-verdict-red font-bold">
                      #{p.rank}
                    </span>
                    <span className="font-mono text-text-secondary">
                      {truncateAddress(p.address)}
                    </span>
                    {p.entityName && (
                      <span className="text-text-dim">{p.entityName}</span>
                    )}
                    {p.pnlUsd !== undefined && (
                      <span className="text-accent-green">
                        +{formatCompactUsd(p.pnlUsd)}
                      </span>
                    )}
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
              href="/investigate/prediction"
              className="text-xs text-text-secondary hover:text-accent-green"
            >
              ← Try another event
            </Link>
          )}
        </div>
      )}

      {/* Complete report */}
      {state === "complete" && report && (
        <div className="space-y-8">
          {/* Early exit / no profiters */}
          {report.metadata.earlyExit && (
            <div className="border border-verdict-green/20 bg-verdict-green/5 px-4 py-3 animate-fade-in">
              <p className="text-xs text-text-secondary">
                No significant profiteering detected for this event.
              </p>
            </div>
          )}

          {/* Insider Score (same component, different label) */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">
              Insider Score
            </p>
            <SuspicionMeter
              score={report.suspicionScore}
              verdict={report.verdict}
            />
          </div>

          {/* Top Profiters */}
          {report.suspects.length > 0 && (
            <div className="animate-fade-in">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">
                Top Profiters
              </p>
              <div className="space-y-2 stagger-fade-in">
                {report.suspects.map((profiter) => (
                  <div
                    key={profiter.address}
                    className="border border-border bg-bg-secondary px-4 py-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-verdict-red">
                          #{profiter.rank}
                        </span>
                        <span className="text-sm font-mono text-text-primary">
                          {truncateAddress(profiter.address)}
                        </span>
                        {profiter.entityName && (
                          <span className="text-xs text-text-dim">
                            {profiter.entityName}
                          </span>
                        )}
                      </div>
                      {profiter.pnlUsd !== undefined && (
                        <span className="text-xs font-bold text-accent-green">
                          +{formatCompactUsd(profiter.pnlUsd)}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 text-[11px] text-text-dim">
                      <span>
                        Position: {formatCompactUsd(profiter.volumeUsd)}
                      </span>
                      {profiter.timingAdvantage > 0 && (
                        <span>
                          Entered:{" "}
                          {profiter.timingAdvantage > 24
                            ? `${Math.round(profiter.timingAdvantage / 24)}d`
                            : `${Math.round(profiter.timingAdvantage)}h`}{" "}
                          before resolution
                        </span>
                      )}
                      {profiter.pnlPercent !== undefined && (
                        <span>
                          Return: {formatPercent(profiter.pnlPercent)}
                        </span>
                      )}
                      {profiter.winRate !== undefined && (
                        <span>
                          Win rate: {formatPercent(profiter.winRate)}
                        </span>
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

          {/* Evidence — no wallet graph for PM mode */}
          <EvidenceCards evidence={report.evidence} />

          {/* AI Narrative */}
          {report.narrative && <CaseNarrative narrative={report.narrative} />}

          {/* Share */}
          <div className="pt-4 border-t border-border animate-fade-in">
            <ShareButtons
              caseId={report.caseId}
              shareableLine={
                report.narrative?.shareableLine ??
                `PM investigation: ${report.subject.name}`
              }
              tokenSymbol={report.subject.outcome || "PM"}
              shareUrl={`/investigate/prediction/${encodeURIComponent(eventId)}`}
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
              Phases: {report.metadata.phasesCompleted.join(", ")}
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
