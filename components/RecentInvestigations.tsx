import Link from "next/link";
import { formatTimeAgo } from "@/lib/utils/format";
import { truncateAddress } from "@/lib/utils/address";
import { VERDICT_CONFIG, type Verdict } from "@/lib/forensics/types";

export interface RecentInvestigation {
  id: string;
  mode: string;
  subject_id: string;
  chain: string | null;
  suspicion_score: number | null;
  verdict: string | null;
  created_at: number;
  // Parsed from report_json
  token_name?: string;
  token_symbol?: string;
}

interface Props {
  investigations: RecentInvestigation[];
}

export function RecentInvestigations({ investigations }: Props) {
  if (investigations.length === 0) {
    return (
      <div className="border border-border bg-bg-secondary px-6 py-8 text-center">
        <p className="text-sm text-text-dim">
          No investigations yet. Be the first to investigate a token.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border bg-bg-secondary">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">
          Recent Investigations
        </h3>
      </div>
      <div className="divide-y divide-border">
        {investigations.map((inv) => {
          const verdict = inv.verdict as Verdict | null;
          const config = verdict ? VERDICT_CONFIG[verdict] : null;

          return (
            <Link
              key={inv.id}
              href={`/investigate/token/${encodeURIComponent(inv.subject_id)}${inv.chain ? `?chain=${inv.chain}` : ""}`}
              className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-bg-card"
            >
              {/* Verdict dot */}
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: config?.color ?? "#444" }}
              />

              {/* Token info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {inv.token_symbol && (
                    <span className="text-sm font-bold text-text-primary">
                      ${inv.token_symbol}
                    </span>
                  )}
                  <span className="text-xs text-text-dim font-mono">
                    {truncateAddress(inv.subject_id)}
                  </span>
                  {inv.chain && (
                    <span className="text-[10px] uppercase text-text-dim">
                      {inv.chain}
                    </span>
                  )}
                </div>
              </div>

              {/* Score + verdict */}
              <div className="flex items-center gap-3 shrink-0">
                {inv.suspicion_score !== null && (
                  <span
                    className="text-sm font-bold font-mono"
                    style={{ color: config?.color ?? "#888" }}
                  >
                    {inv.suspicion_score}
                  </span>
                )}
                {config && (
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: config.color }}
                  >
                    {config.label}
                  </span>
                )}
              </div>

              {/* Time */}
              <span className="text-[10px] text-text-dim shrink-0">
                {formatTimeAgo(inv.created_at)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
