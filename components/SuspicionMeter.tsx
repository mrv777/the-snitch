"use client";

import { useEffect, useState } from "react";
import { VERDICT_CONFIG, type Verdict } from "@/lib/forensics/types";

interface Props {
  score: number;
  verdict: Verdict;
}

export function SuspicionMeter({ score, verdict }: Props) {
  const [displayScore, setDisplayScore] = useState(0);
  const config = VERDICT_CONFIG[verdict];

  // Animate score counting up
  useEffect(() => {
    const duration = 1200;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(eased * score));
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }, [score]);

  return (
    <div className="animate-fade-in">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">
        Suspicion Score
      </p>

      {/* Score bar */}
      <div className="mb-2 h-2 w-full bg-border">
        <div
          className="h-full animate-gauge-fill"
          style={{
            width: `${score}%`,
            backgroundColor: config.color,
          }}
        />
      </div>

      {/* Score + verdict label */}
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span
            className="text-4xl font-extrabold font-display"
            style={{ color: config.color }}
          >
            {displayScore}
          </span>
          <span className="text-sm text-text-dim">/100</span>
        </div>
        <span
          className="text-sm font-bold uppercase tracking-wider"
          style={{ color: config.color }}
        >
          {config.label}
        </span>
      </div>
    </div>
  );
}
