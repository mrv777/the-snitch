import type { ForensicReport, TimelineEvent } from "@/lib/forensics/types";
import { VERDICT_CONFIG } from "@/lib/forensics/types";

interface Props {
  report: ForensicReport;
  siteName: string;
}

const EVENT_COLORS: Record<string, string> = {
  suspect_buy: "#FF4444",
  suspect_sell: "#FF8800",
  smart_money_activity: "#00D4FF",
  price_move: "#FFB800",
  flow_reversal: "#00FF88",
  large_transfer: "#888888",
};

const NOISE_SVG =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function formatEventDescription(event: TimelineEvent): string {
  const actor = event.actor ? `${event.actor}  ` : "";
  return `${actor}${event.description}`;
}

function isSuspectEvent(type: string): boolean {
  return type === "suspect_buy" || type === "suspect_sell";
}

export function TimelineCard({ report, siteName }: Props) {
  const verdictCfg = VERDICT_CONFIG[report.verdict];
  const accentColor = verdictCfg.color;
  const mono = "'JetBrains Mono', 'Cascadia Code', monospace";
  const display = "Syne, system-ui, sans-serif";

  const events = report.timeline.slice(0, 7); // max 7 events to fit card
  const caseNumber = report.caseId.replace("case-", "#");

  const anomalyLabel = report.anomaly
    ? `${report.anomaly.priceChangePct > 0 ? "+" : ""}${report.anomaly.priceChangePct.toFixed(0)}% ${report.anomaly.direction} on ${new Date(report.anomaly.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : "";

  return (
    <div
      style={{
        width: 1200,
        height: 630,
        background: "#0A0A0A",
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
          padding: "28px 56px 28px",
          height: "calc(100% - 6px)",
          display: "flex",
          flexDirection: "column",
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span
              style={{
                fontFamily: display,
                fontSize: 16,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: accentColor,
              }}
            >
              THE SNITCH — FORENSIC TIMELINE
            </span>
          </div>
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

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.08)",
            marginBottom: 16,
          }}
        />

        {/* Token + Anomaly info */}
        <div style={{ marginBottom: 20 }}>
          <span
            style={{
              fontFamily: display,
              fontSize: 22,
              fontWeight: 800,
              textTransform: "uppercase",
              color: "#fff",
            }}
          >
            ${report.subject.symbol}
          </span>
          {anomalyLabel && (
            <span
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.4)",
                marginLeft: 12,
              }}
            >
              — {anomalyLabel}
            </span>
          )}
        </div>

        {/* Timeline events */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {events.map((event, i) => {
            const eventColor = EVENT_COLORS[event.type] ?? "#888888";
            const isPriceEvent = event.type === "price_move";

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: isPriceEvent ? "6px 0" : "3px 0",
                }}
              >
                {/* Relative time label */}
                <span
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.35)",
                    width: 56,
                    textAlign: "right",
                    flexShrink: 0,
                  }}
                >
                  {event.relativeLabel}
                </span>

                {/* Dot */}
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: eventColor,
                    flexShrink: 0,
                    boxShadow: isPriceEvent
                      ? `0 0 8px ${eventColor}`
                      : "none",
                  }}
                />

                {/* Description */}
                <span
                  style={{
                    fontSize: isPriceEvent ? 16 : 14,
                    fontWeight: isPriceEvent ? 700 : 400,
                    color: isPriceEvent
                      ? eventColor
                      : "rgba(255,255,255,0.8)",
                    flex: 1,
                  }}
                >
                  {isPriceEvent ? (
                    <>
                      ████ {event.description} ████
                    </>
                  ) : (
                    formatEventDescription(event)
                  )}
                </span>

                {/* Suspect badge */}
                {isSuspectEvent(event.type) && (
                  <span
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      color: eventColor,
                      border: `1px solid ${eventColor}40`,
                      padding: "2px 8px",
                      textTransform: "uppercase",
                    }}
                  >
                    SUSPECT
                  </span>
                )}
              </div>
            );
          })}

          {events.length === 0 && (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                color: "rgba(255,255,255,0.3)",
              }}
            >
              No timeline events recorded
            </div>
          )}
        </div>

        {/* Summary line */}
        {report.suspects.length > 0 && (
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.35)",
              marginTop: 12,
              marginBottom: 8,
            }}
          >
            {report.suspects.length} wallet{report.suspects.length > 1 ? "s" : ""}{" "}
            {report.clusters.length > 0 ? "connected via wallet tracing" : "identified"}
          </div>
        )}

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingTop: 12,
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
