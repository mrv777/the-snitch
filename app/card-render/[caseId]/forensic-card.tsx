import type { ForensicReport } from "@/lib/forensics/types";
import { VERDICT_CONFIG } from "@/lib/forensics/types";

interface Props {
  report: ForensicReport;
  siteName: string;
}

function verdictToDarkBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c * 0.12);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function formatCompactUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

const NOISE_SVG =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function ForensicCard({ report, siteName }: Props) {
  const verdictCfg = VERDICT_CONFIG[report.verdict];
  const accentColor = verdictCfg.color;
  const darkBg = verdictToDarkBg(accentColor);
  const mono = "'JetBrains Mono', 'Cascadia Code', monospace";
  const display = "Syne, system-ui, sans-serif";

  const scorePercent = Math.min(100, Math.max(0, report.suspicionScore));
  const findings = report.narrative?.keyFindings?.slice(0, 3) ?? [];
  const caseNumber = report.caseId.replace("case-", "#");

  return (
    <div
      style={{
        width: 1200,
        height: 630,
        background: darkBg,
        position: "relative",
        overflow: "hidden",
        fontFamily: mono,
        color: "#E0E0E0",
      }}
    >
      {/* Noise grain overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.05,
          backgroundImage: NOISE_SVG,
          backgroundSize: "128px",
        }}
      />

      {/* CLASSIFIED stripe */}
      <div
        style={{
          height: 6,
          background: accentColor,
          position: "relative",
          zIndex: 1,
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "relative",
          padding: "32px 56px 32px",
          height: "calc(100% - 6px)",
          display: "flex",
          flexDirection: "column",
          zIndex: 1,
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
            <span
              style={{
                fontFamily: display,
                fontSize: 18,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: accentColor,
              }}
            >
              THE SNITCH
            </span>
            <span
              style={{
                fontSize: 12,
                letterSpacing: "0.15em",
                color: "rgba(255,255,255,0.3)",
                textTransform: "uppercase",
              }}
            >
              CASE {caseNumber}
            </span>
          </div>
          <span
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.2)",
              letterSpacing: "0.1em",
            }}
          >
            {siteName}
          </span>
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.08)",
            marginBottom: 24,
          }}
        />

        {/* Token + Chain row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 28,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span
              style={{
                fontFamily: display,
                fontSize: 36,
                fontWeight: 800,
                textTransform: "uppercase",
                lineHeight: 1,
                color: "#fff",
              }}
            >
              ${report.subject.symbol}
            </span>
            {report.subject.marketCapUsd && (
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>
                MCap: {formatCompactUsd(report.subject.marketCapUsd)}
              </span>
            )}
          </div>
          <span
            style={{
              fontSize: 13,
              letterSpacing: "0.15em",
              color: "rgba(255,255,255,0.25)",
              textTransform: "uppercase",
            }}
          >
            {report.subject.chain}
          </span>
        </div>

        {/* Suspicion Score */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            SUSPICION SCORE
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Score bar */}
            <div
              style={{
                flex: 1,
                height: 24,
                background: "rgba(255,255,255,0.06)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${scorePercent}%`,
                  height: "100%",
                  background: accentColor,
                  opacity: 0.9,
                }}
              />
            </div>
            {/* Score number */}
            <span
              style={{
                fontFamily: display,
                fontSize: 32,
                fontWeight: 800,
                lineHeight: 1,
                color: accentColor,
                minWidth: 80,
              }}
            >
              {report.suspicionScore}/100
            </span>
            {/* Verdict */}
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: accentColor,
                textTransform: "uppercase",
              }}
            >
              {verdictCfg.label}
            </span>
          </div>
        </div>

        {/* Key Findings */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            KEY FINDINGS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {findings.map((finding, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    color: accentColor,
                    fontSize: 14,
                    lineHeight: "22px",
                    flexShrink: 0,
                  }}
                >
                  ■
                </span>
                <span
                  style={{
                    fontSize: 16,
                    lineHeight: "22px",
                    color: "rgba(255,255,255,0.85)",
                  }}
                >
                  {finding}
                </span>
              </div>
            ))}
            {findings.length === 0 && report.anomaly && (
              <span style={{ fontSize: 16, color: "rgba(255,255,255,0.5)" }}>
                {report.anomaly.direction === "pump" ? "+" : ""}
                {report.anomaly.priceChangePct.toFixed(1)}% {report.anomaly.direction} detected
                {report.suspects.length > 0 &&
                  ` — ${report.suspects.length} suspect${report.suspects.length > 1 ? "s" : ""} identified`}
              </span>
            )}
            {findings.length === 0 && !report.anomaly && (
              <span style={{ fontSize: 16, color: "rgba(255,255,255,0.5)" }}>
                No anomalous activity detected
              </span>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingTop: 16,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.05em",
              color: accentColor,
            }}
          >
            {siteName}
          </span>
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.2)",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
            }}
          >
            Powered by Nansen
          </span>
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.2)",
              letterSpacing: "0.1em",
            }}
          >
            #NansenCLI
          </span>
        </div>
      </div>
    </div>
  );
}
