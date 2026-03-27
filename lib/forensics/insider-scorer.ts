import type {
  EvidenceItem,
  EvidenceFactor,
  Suspect,
  SuspectCluster,
} from "./types";
import type { PmPnlByMarketRow } from "@/lib/nansen/types";

// --- Insider Score Factor Weights (adapted from token suspicion scoring for PM context) ---
// PM scoring emphasizes: when did they enter the position, how much did they profit,
// and are their wallets connected to other profiteers?

interface FactorConfig {
  factor: EvidenceFactor;
  weight: number;
  label: string;
}

const INSIDER_FACTORS: FactorConfig[] = [
  { factor: "position_timing", weight: 0.35, label: "Position Timing" },
  { factor: "profit_magnitude", weight: 0.25, label: "Profit Magnitude" },
  { factor: "profit_concentration", weight: 0.2, label: "Profit Concentration" },
  { factor: "wallet_connections", weight: 0.1, label: "Wallet Connections" },
  { factor: "track_record", weight: 0.1, label: "Track Record" },
];

// --- Scoring Inputs ---

export interface InsiderScoringInput {
  profiters: Suspect[]; // top profiters (reusing Suspect type)
  clusters: SuspectCluster[];
  totalMarketPnl: number; // total PnL across all market participants
  pnlByMarket: PmPnlByMarketRow[]; // all PnL entries for this market
  hasConnectionData: boolean;
  resolutionTimestamp?: number; // when the event resolved (unix seconds)
}

// --- Sub-Score Calculators ---

/**
 * Position Timing: How early before resolution did the top profiters enter?
 * Uses timingAdvantage field (hours before resolution they entered their winning position).
 * >7 days = 100, 3-7 days = 80, 1-3 days = 60, <1 day = 40, no data = 0
 */
function scorePositionTiming(
  profiters: Suspect[]
): { subScore: number; description: string } {
  if (profiters.length === 0) {
    return { subScore: 0, description: "No profiters identified" };
  }

  const maxAdvantage = Math.max(...profiters.map((p) => p.timingAdvantage));
  const maxDays = maxAdvantage / 24;

  let subScore: number;
  let tier: string;
  if (maxDays > 7) {
    subScore = 100;
    tier = `${Math.round(maxDays)} days`;
  } else if (maxDays > 3) {
    subScore = 80;
    tier = `${Math.round(maxDays)} days`;
  } else if (maxDays > 1) {
    subScore = 60;
    tier = `${Math.round(maxDays)} days`;
  } else if (maxAdvantage > 0) {
    subScore = 40;
    tier = `${Math.round(maxAdvantage)}h`;
  } else {
    subScore = 0;
    tier = "no timing data";
  }

  const top = profiters[0];
  const addr = top.address.slice(0, 6) + "..." + top.address.slice(-4);
  const description =
    maxAdvantage > 0
      ? `Top profiter (${top.entityName || addr}) entered position ${tier} before resolution`
      : "No early position entry detected";

  return { subScore, description };
}

/**
 * Profit Magnitude: How large were the profits?
 * >$500K = 100, $100K-$500K = 80, $50K-$100K = 60, $10K-$50K = 40, <$10K = 20
 */
function scoreProfitMagnitude(
  profiters: Suspect[]
): { subScore: number; description: string } {
  const withPnl = profiters.filter(
    (p) => p.pnlUsd !== undefined && p.pnlUsd > 0
  );

  if (withPnl.length === 0) {
    return { subScore: 0, description: "No profit data available" };
  }

  const maxPnl = Math.max(...withPnl.map((p) => p.pnlUsd!));

  let subScore: number;
  if (maxPnl > 500_000) subScore = 100;
  else if (maxPnl > 100_000) subScore = 80;
  else if (maxPnl > 50_000) subScore = 60;
  else if (maxPnl > 10_000) subScore = 40;
  else subScore = 20;

  const topProfiter = withPnl.sort(
    (a, b) => (b.pnlUsd ?? 0) - (a.pnlUsd ?? 0)
  )[0];

  const description =
    topProfiter.pnlUsd !== undefined
      ? `Top profiter earned $${Math.round(topProfiter.pnlUsd).toLocaleString()} from this market`
      : "Profit data incomplete";

  return { subScore, description };
}

/**
 * Profit Concentration: What % of total market PnL went to the top 3?
 * >50% = 100, 30-50% = 70, 10-30% = 40, <10% = 20
 */
function scoreProfitConcentration(
  profiters: Suspect[],
  totalMarketPnl: number
): { subScore: number; description: string } {
  if (totalMarketPnl <= 0 || profiters.length === 0) {
    return { subScore: 0, description: "Insufficient PnL data" };
  }

  const top3Pnl = profiters
    .slice(0, 3)
    .reduce((sum, p) => sum + Math.max(p.pnlUsd ?? 0, 0), 0);
  const pct = (top3Pnl / totalMarketPnl) * 100;

  let subScore: number;
  if (pct > 50) subScore = 100;
  else if (pct > 30) subScore = 70;
  else if (pct > 10) subScore = 40;
  else subScore = 20;

  const description = `Top ${Math.min(3, profiters.length)} profiters captured ${pct.toFixed(1)}% of total market profits`;
  return { subScore, description };
}

/**
 * Wallet Connections: Are top profiters connected?
 * Same as token scoring: same_funding = 100, shared_counterparties = 70, related = 50, none = 0
 */
function scoreWalletConnections(
  clusters: SuspectCluster[],
  hasConnectionData: boolean
): { subScore: number; description: string } {
  if (!hasConnectionData) {
    return { subScore: 0, description: "Connection data unavailable" };
  }

  if (clusters.length === 0) {
    return { subScore: 0, description: "No connections found between profiters" };
  }

  let bestScore = 0;
  let bestDescription = "";

  for (const cluster of clusters) {
    let score: number;
    let desc: string;
    switch (cluster.connectionType) {
      case "same_funding":
        score = 100;
        desc = `${cluster.suspects.length} profiters trace to the same funding source`;
        break;
      case "shared_counterparties":
        score = 70;
        desc = `${cluster.suspects.length} profiters share common counterparties`;
        break;
      case "related_wallets":
        score = 50;
        desc = `${cluster.suspects.length} profiters flagged as related by Nansen`;
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
 * Track Record: Does the profiter have a suspicious win rate on PM?
 * Uses winRate from profiler pnl-summary and pnlPercent as proxy.
 * >90% win rate = 100, >80% = 70, >70% = 50, >60% = 30, <60% = 10
 */
function scoreTrackRecord(
  profiters: Suspect[]
): { subScore: number; description: string } {
  const withWinRate = profiters.filter(
    (p) => p.winRate !== undefined && p.winRate > 0
  );

  if (withWinRate.length === 0) {
    return { subScore: 0, description: "No track record data available" };
  }

  const maxWinRate = Math.max(...withWinRate.map((p) => p.winRate!));

  let subScore: number;
  if (maxWinRate > 90) subScore = 100;
  else if (maxWinRate > 80) subScore = 70;
  else if (maxWinRate > 70) subScore = 50;
  else if (maxWinRate > 60) subScore = 30;
  else subScore = 10;

  const topTrader = withWinRate.sort(
    (a, b) => (b.winRate ?? 0) - (a.winRate ?? 0)
  )[0];

  const description = `Top profiter has ${topTrader.winRate?.toFixed(0)}% historical win rate across all trades`;
  return { subScore, description };
}

// --- Main Insider Scorer ---

export function computeInsiderScore(input: InsiderScoringInput): {
  score: number;
  evidence: EvidenceItem[];
} {
  const positionTiming = scorePositionTiming(input.profiters);
  const profitMag = scoreProfitMagnitude(input.profiters);
  const profitConc = scoreProfitConcentration(
    input.profiters,
    input.totalMarketPnl
  );
  const connections = scoreWalletConnections(
    input.clusters,
    input.hasConnectionData
  );
  const trackRecord = scoreTrackRecord(input.profiters);

  const subScores: Record<EvidenceFactor, { subScore: number; description: string }> = {
    // Token factors (unused in PM but needed for type completeness)
    timing: { subScore: 0, description: "" },
    volume_concentration: { subScore: 0, description: "" },
    smart_money_labels: { subScore: 0, description: "" },
    // PM factors
    position_timing: positionTiming,
    profit_magnitude: profitMag,
    profit_concentration: profitConc,
    wallet_connections: connections,
    track_record: trackRecord,
  };

  const evidence: EvidenceItem[] = INSIDER_FACTORS.map((f) => {
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
