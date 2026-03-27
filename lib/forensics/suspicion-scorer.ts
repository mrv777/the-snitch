import type {
  EvidenceItem,
  EvidenceFactor,
  Suspect,
  SuspectCluster,
} from "./types";
import type { WhoBoughtSoldRow } from "@/lib/nansen/types";

// --- Factor Weights (from SPEC section 6) ---
// Note: If who-bought-sold labels are sparse, redistribute Smart Money Labels
// weight to Timing (→35%) and Wallet Connections (→25%).

interface FactorConfig {
  factor: EvidenceFactor;
  weight: number;
  label: string;
}

const DEFAULT_FACTORS: FactorConfig[] = [
  { factor: "timing", weight: 0.3, label: "Timing Advantage" },
  { factor: "volume_concentration", weight: 0.2, label: "Volume Concentration" },
  { factor: "wallet_connections", weight: 0.2, label: "Wallet Connections" },
  { factor: "smart_money_labels", weight: 0.15, label: "Smart Money Labels" },
  { factor: "profit_magnitude", weight: 0.15, label: "Profit Magnitude" },
];

// Fallback weights when labels are sparse
const SPARSE_LABEL_FACTORS: FactorConfig[] = [
  { factor: "timing", weight: 0.35, label: "Timing Advantage" },
  { factor: "volume_concentration", weight: 0.2, label: "Volume Concentration" },
  { factor: "wallet_connections", weight: 0.25, label: "Wallet Connections" },
  { factor: "smart_money_labels", weight: 0.05, label: "Smart Money Labels" },
  { factor: "profit_magnitude", weight: 0.15, label: "Profit Magnitude" },
];

// --- Scoring Inputs ---

export interface ScoringInput {
  suspects: Suspect[];
  clusters: SuspectCluster[];
  totalPreMoveVolume: number; // total USD volume before anomaly
  whoBoughtSold: WhoBoughtSoldRow[];
  hasConnectionData: boolean; // whether trace/compare/related data exists
}

// --- Sub-Score Calculators ---

/**
 * Timing: How early before the price move did suspects trade?
 * >24h = 100, 6-24h = 80, 1-6h = 60, <1h = 40, no timing data = 0
 */
function scoreTiming(suspects: Suspect[]): { subScore: number; description: string } {
  if (suspects.length === 0) {
    return { subScore: 0, description: "No suspects identified" };
  }

  const maxAdvantage = Math.max(...suspects.map((s) => s.timingAdvantage));

  let subScore: number;
  let tier: string;
  if (maxAdvantage > 24) {
    subScore = 100;
    tier = `>${Math.round(maxAdvantage)}h`;
  } else if (maxAdvantage > 6) {
    subScore = 80;
    tier = `${Math.round(maxAdvantage)}h`;
  } else if (maxAdvantage > 1) {
    subScore = 60;
    tier = `${Math.round(maxAdvantage)}h`;
  } else if (maxAdvantage > 0) {
    subScore = 40;
    tier = `${Math.round(maxAdvantage * 60)}min`;
  } else if (suspects.length > 0) {
    // Suspects exist but no timing data — likely data limitation
    // (dex-trades only returns recent data, anomaly may be older)
    subScore = 20;
    tier = "no timing data available";
  } else {
    subScore = 0;
    tier = "no timing advantage";
  }

  const topSuspect = suspects[0];
  const description =
    maxAdvantage > 0
      ? `Top suspect traded ${tier} before price move (${topSuspect.address.slice(0, 10)}…)`
      : "No suspicious pre-move trading detected";

  return { subScore, description };
}

/**
 * Volume Concentration: % of pre-move volume from top 3 wallets.
 * >50% = 100, 30-50% = 70, 10-30% = 40, <10% = 20
 */
function scoreVolumeConcentration(
  suspects: Suspect[],
  totalPreMoveVolume: number
): { subScore: number; description: string } {
  if (totalPreMoveVolume <= 0 || suspects.length === 0) {
    return { subScore: 0, description: "Insufficient volume data" };
  }

  const top3Volume = suspects.slice(0, 3).reduce((sum, s) => sum + s.volumeUsd, 0);
  const pct = (top3Volume / totalPreMoveVolume) * 100;

  let subScore: number;
  if (pct > 50) subScore = 100;
  else if (pct > 30) subScore = 70;
  else if (pct > 10) subScore = 40;
  else subScore = 20;

  const description = `Top ${Math.min(3, suspects.length)} wallets controlled ${pct.toFixed(1)}% of pre-move volume`;
  return { subScore, description };
}

/**
 * Wallet Connections: Are suspects connected?
 * Same funding source = 100, shared counterparties = 70, related wallets = 50, none = 0
 */
function scoreWalletConnections(
  clusters: SuspectCluster[],
  hasConnectionData: boolean
): { subScore: number; description: string } {
  if (!hasConnectionData) {
    return { subScore: 0, description: "Connection data unavailable" };
  }

  if (clusters.length === 0) {
    return { subScore: 0, description: "No connections found between suspects" };
  }

  // Find the strongest connection type
  let bestScore = 0;
  let bestDescription = "";

  for (const cluster of clusters) {
    let score: number;
    let desc: string;
    switch (cluster.connectionType) {
      case "same_funding":
        score = 100;
        desc = `${cluster.suspects.length} wallets trace to the same funding source`;
        break;
      case "shared_counterparties":
        score = 70;
        desc = `${cluster.suspects.length} wallets share common counterparties`;
        break;
      case "related_wallets":
        score = 50;
        desc = `${cluster.suspects.length} wallets flagged as related by Nansen`;
        break;
    }
    if (score > bestScore) {
      bestScore = score;
      bestDescription = desc;
    }
  }

  return { subScore: bestScore, description: bestDescription };
}

/**
 * Smart Money Labels: Are suspects labeled entities?
 * Known fund = 100, smart trader = 70, labeled = 50, unlabeled = 20
 */
function scoreSmartMoneyLabels(
  suspects: Suspect[],
  whoBoughtSold: WhoBoughtSoldRow[]
): { subScore: number; description: string; labelsSparse: boolean } {
  // Count how many who-bought-sold entries have labels
  const totalEntries = whoBoughtSold.length;
  const labeledEntries = whoBoughtSold.filter(
    (r) => r.address_label
  ).length;
  const labelsSparse = totalEntries === 0 || labeledEntries / totalEntries < 0.1;

  if (suspects.length === 0) {
    return {
      subScore: 0,
      description: "No suspects to check labels for",
      labelsSparse,
    };
  }

  // Check suspect labels
  const labeledSuspects = suspects.filter((s) => s.entityName || s.label);

  if (labeledSuspects.length === 0) {
    return {
      subScore: 20,
      description: "Suspects are unlabeled wallets",
      labelsSparse,
    };
  }

  // Grade by label type
  const labels = labeledSuspects.map((s) =>
    (s.label || s.entityName || "").toLowerCase()
  );

  let bestScore = 20;
  let bestLabel = "labeled";

  for (const label of labels) {
    if (label.includes("fund") || label.includes("capital") || label.includes("ventures")) {
      if (bestScore < 100) {
        bestScore = 100;
        bestLabel = "known fund";
      }
    } else if (label.includes("smart") || label.includes("trader") || label.includes("whale")) {
      if (bestScore < 70) {
        bestScore = 70;
        bestLabel = "smart trader";
      }
    } else if (label) {
      if (bestScore < 50) {
        bestScore = 50;
        bestLabel = "labeled entity";
      }
    }
  }

  const plural = labeledSuspects.length > 1;
  const labelText = bestLabel === "labeled entity"
    ? (plural ? "labeled entities" : "a labeled entity")
    : (plural ? `${bestLabel}s` : `a ${bestLabel}`);
  const description = `${labeledSuspects.length}/${suspects.length} suspects are ${labelText}`;
  return { subScore: bestScore, description, labelsSparse };
}

/**
 * Profit Magnitude: How much did suspects profit vs historical average?
 * >10x avg = 100, 5-10x = 70, 2-5x = 40, <2x = 20
 */
function scoreProfitMagnitude(
  suspects: Suspect[]
): { subScore: number; description: string } {
  const suspectsWithPnl = suspects.filter(
    (s) => s.pnlUsd !== undefined && s.pnlUsd > 0
  );

  if (suspectsWithPnl.length === 0) {
    return { subScore: 0, description: "No profit data available" };
  }

  // Score based on both percentage return AND absolute profit
  const maxPnlPct = Math.max(
    ...suspectsWithPnl.map((s) => Math.abs(s.pnlPercent ?? 0))
  );
  const maxPnlUsd = Math.max(
    ...suspectsWithPnl.map((s) => Math.abs(s.pnlUsd ?? 0))
  );

  // Score by percentage
  let pctScore: number;
  if (maxPnlPct > 1000) pctScore = 100; // >10x
  else if (maxPnlPct > 500) pctScore = 70;
  else if (maxPnlPct > 200) pctScore = 40;
  else pctScore = 20;

  // Score by absolute USD profit
  let usdScore: number;
  if (maxPnlUsd > 500_000) usdScore = 100;
  else if (maxPnlUsd > 100_000) usdScore = 80;
  else if (maxPnlUsd > 10_000) usdScore = 60;
  else if (maxPnlUsd > 1_000) usdScore = 40;
  else usdScore = 20;

  // Take the higher of the two — catches cases where pnlPercent is
  // the wallet-wide rate (tiny) but absolute profit is significant
  const subScore = Math.max(pctScore, usdScore);

  const topProfiter = suspectsWithPnl.sort(
    (a, b) => (b.pnlUsd ?? 0) - (a.pnlUsd ?? 0)
  )[0];

  const pctLabel = maxPnlPct > 1 ? ` (${maxPnlPct.toFixed(0)}% return)` : "";
  const description =
    topProfiter.pnlUsd !== undefined
      ? `Top suspect profited $${Math.round(topProfiter.pnlUsd).toLocaleString()}${pctLabel}`
      : "Profit data incomplete";

  return { subScore, description };
}

// --- Main Scorer ---

export function computeSuspicionScore(input: ScoringInput): {
  score: number;
  evidence: EvidenceItem[];
} {
  const timing = scoreTiming(input.suspects);
  const volume = scoreVolumeConcentration(
    input.suspects,
    input.totalPreMoveVolume
  );
  const connections = scoreWalletConnections(
    input.clusters,
    input.hasConnectionData
  );
  const labels = scoreSmartMoneyLabels(input.suspects, input.whoBoughtSold);
  const profit = scoreProfitMagnitude(input.suspects);

  // Choose weight set based on label sparseness
  const factors = labels.labelsSparse ? SPARSE_LABEL_FACTORS : DEFAULT_FACTORS;

  const subScores: Record<EvidenceFactor, { subScore: number; description: string }> = {
    timing,
    volume_concentration: volume,
    wallet_connections: connections,
    smart_money_labels: labels,
    profit_magnitude: profit,
    // PM factors (unused in token scoring, but needed for Record completeness)
    position_timing: { subScore: 0, description: "" },
    profit_concentration: { subScore: 0, description: "" },
    track_record: { subScore: 0, description: "" },
  };

  const evidence: EvidenceItem[] = factors.map((f) => {
    const { subScore, description } = subScores[f.factor];
    return {
      factor: f.factor,
      weight: f.weight,
      subScore,
      weightedScore: Math.round(subScore * f.weight),
      description,
    };
  });

  const score = Math.round(
    evidence.reduce((sum, e) => sum + e.subScore * e.weight, 0)
  );

  return { score: Math.min(100, Math.max(0, score)), evidence };
}
