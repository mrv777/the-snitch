"use client";

import { useState, useEffect } from "react";
import type { InvestigationPhase } from "@/lib/forensics/types";

interface Props {
  currentPhase: InvestigationPhase;
  currentStep: string;
  completedPhases: InvestigationPhase[];
}

const PHASE_LABELS: Record<InvestigationPhase, string> = {
  0: "Recon",
  1: "Suspect Identification",
  2: "Deep Profiling",
  3: "Analysis & Report",
};

const PHASE_SUBSTEPS: Record<InvestigationPhase, string[]> = {
  0: ["Scanning price history...", "Identifying anomalies..."],
  1: ["Identifying suspects...", "Analyzing trading patterns..."],
  2: ["Tracing wallet connections...", "Profiling suspects..."],
  3: ["Analyzing evidence...", "Generating intelligence report..."],
};

export function InvestigationLoading({
  currentPhase,
  currentStep,
  completedPhases,
}: Props) {
  const [subStepIdx, setSubStepIdx] = useState(0);

  // Rotate sub-steps for visual polish
  useEffect(() => {
    setSubStepIdx(0);
    const substeps = PHASE_SUBSTEPS[currentPhase];
    if (substeps.length <= 1) return;

    const interval = setInterval(() => {
      setSubStepIdx((i) => (i + 1) % substeps.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [currentPhase]);

  const displayStep =
    currentStep || PHASE_SUBSTEPS[currentPhase]?.[subStepIdx] || "Processing...";

  return (
    <div className="mx-auto max-w-md animate-fade-in">
      {/* Phase indicators */}
      <div className="mb-8 flex gap-1">
        {([0, 1, 2, 3] as InvestigationPhase[]).map((phase) => {
          const isCompleted = completedPhases.includes(phase);
          const isCurrent = phase === currentPhase && !isCompleted;

          return (
            <div key={phase} className="flex-1">
              <div
                className={`h-1 transition-all duration-500 ${
                  isCompleted
                    ? "bg-accent-green"
                    : isCurrent
                      ? "bg-accent-green/50 animate-pulse-glow"
                      : "bg-border"
                }`}
              />
              <p
                className={`mt-1.5 text-[10px] uppercase tracking-wider ${
                  isCompleted
                    ? "text-accent-green"
                    : isCurrent
                      ? "text-text-secondary"
                      : "text-text-dim"
                }`}
              >
                {PHASE_LABELS[phase]}
              </p>
            </div>
          );
        })}
      </div>

      {/* Current step */}
      <p className="text-sm text-text-secondary">{displayStep}</p>
    </div>
  );
}
