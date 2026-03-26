import type { EvidenceItem, EvidenceFactor } from "@/lib/forensics/types";

interface Props {
  evidence: EvidenceItem[];
}

const FACTOR_LABELS: Record<EvidenceFactor, string> = {
  timing: "Timing Advantage",
  volume_concentration: "Volume Concentration",
  wallet_connections: "Wallet Connections",
  smart_money_labels: "Smart Money Labels",
  profit_magnitude: "Profit Magnitude",
};

function scoreColor(subScore: number): string {
  if (subScore >= 80) return "#FF4444";
  if (subScore >= 60) return "#FF8800";
  if (subScore >= 40) return "#FFB800";
  if (subScore >= 20) return "#888888";
  return "#00FF88";
}

export function EvidenceCards({ evidence }: Props) {
  if (evidence.length === 0) return null;

  return (
    <div className="animate-fade-in">
      <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">
        Evidence
      </p>

      <div className="space-y-2 stagger-fade-in">
        {evidence.map((item) => {
          const color = scoreColor(item.subScore);
          return (
            <div
              key={item.factor}
              className="border border-border bg-bg-secondary px-4 py-3"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                  {FACTOR_LABELS[item.factor]}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-text-dim">
                    {Math.round(item.weight * 100)}% weight
                  </span>
                  <span
                    className="text-sm font-bold font-mono"
                    style={{ color }}
                  >
                    {item.subScore}
                  </span>
                </div>
              </div>

              {/* Score bar */}
              <div className="mb-2 h-1 w-full bg-border">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${item.subScore}%`,
                    backgroundColor: color,
                  }}
                />
              </div>

              <p className="text-xs text-text-secondary">{item.description}</p>
              {item.details && (
                <p className="mt-1 text-[11px] text-text-dim">
                  {item.details}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
