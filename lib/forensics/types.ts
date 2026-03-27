// --- Verdicts ---

export type Verdict =
  | "HIGHLY_SUSPICIOUS"
  | "SUSPICIOUS"
  | "NOTABLE"
  | "INCONCLUSIVE"
  | "CLEAN";

export const VERDICT_CONFIG: Record<
  Verdict,
  { label: string; color: string; minScore: number }
> = {
  HIGHLY_SUSPICIOUS: { label: "HIGHLY SUSPICIOUS", color: "#FF4444", minScore: 80 },
  SUSPICIOUS: { label: "SUSPICIOUS", color: "#FF8800", minScore: 60 },
  NOTABLE: { label: "NOTABLE", color: "#FFB800", minScore: 40 },
  INCONCLUSIVE: { label: "INCONCLUSIVE", color: "#888888", minScore: 20 },
  CLEAN: { label: "CLEAN", color: "#00FF88", minScore: 0 },
};

export function scoreToVerdict(score: number): Verdict {
  if (score >= 80) return "HIGHLY_SUSPICIOUS";
  if (score >= 60) return "SUSPICIOUS";
  if (score >= 40) return "NOTABLE";
  if (score >= 20) return "INCONCLUSIVE";
  return "CLEAN";
}

// --- Anomaly Detection ---

export interface AnomalyWindow {
  date: string; // ISO date of anomaly day
  timestamp: number; // Unix timestamp of peak
  priceChangePct: number; // % change that triggered detection
  direction: "pump" | "dump";
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
}

// --- Suspects ---

export interface Suspect {
  address: string;
  entityName?: string;
  label?: string;
  rank: number; // 1-based
  score: number; // weighted union score (internal ranking metric)
  timingAdvantage: number; // hours before price move
  volumeUsd: number;
  action: "buy" | "sell" | "both";
  isDexVisible: boolean;
  pnlUsd?: number;
  pnlPercent?: number;
  winRate?: number;
  perpPositions?: {
    market: string;
    side: "long" | "short";
    sizeUsd: number;
    unrealizedPnl: number;
  }[];
}

export interface SuspectCluster {
  suspects: Suspect[];
  connectionType: "same_funding" | "shared_counterparties" | "related_wallets";
  description: string;
}

// --- Timeline ---

export type TimelineEventType =
  | "suspect_buy"
  | "suspect_sell"
  | "smart_money_activity"
  | "price_move"
  | "flow_reversal"
  | "large_transfer"
  // PM-specific timeline event types
  | "position_entry"
  | "position_exit"
  | "odds_movement"
  | "event_resolution";

export interface TimelineEvent {
  timestamp: number; // unix seconds
  relativeLabel: string; // e.g., "T-6h", "T+1h"
  type: TimelineEventType;
  actor?: string; // address or label
  description: string;
  volumeUsd?: number;
  transactionHash?: string;
}

// --- Wallet Graph ---

export type GraphNodeType = "suspect" | "related" | "funding_source" | "exchange";
export type GraphEdgeType = "transaction" | "funding" | "shared_counterparty";

export interface GraphNode {
  id: string; // address
  label: string; // truncated address or entity name
  type: GraphNodeType;
  suspectRank?: number; // 1-3 if suspect node
  entityName?: string;
}

export interface GraphEdge {
  source: string; // node id (address)
  target: string; // node id (address)
  type: GraphEdgeType;
  label?: string;
  volumeUsd?: number;
}

export interface WalletGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// --- Evidence ---

export type EvidenceFactor =
  | "timing"
  | "volume_concentration"
  | "wallet_connections"
  | "smart_money_labels"
  | "profit_magnitude"
  // PM-specific evidence factors
  | "position_timing"
  | "profit_concentration"
  | "track_record";

export interface EvidenceItem {
  factor: EvidenceFactor;
  weight: number; // 0.15 - 0.30
  subScore: number; // 0-100
  weightedScore: number; // subScore * weight
  description: string;
  details?: string;
}

// --- AI Narrative ---

export interface AINarrative {
  caseNarrative: string; // 3-5 paragraphs
  keyFindings: string[]; // 3 items, <100 chars each
  shareableLine: string; // <120 chars, tweet-ready
  verdictLabel: string;
}

// --- Phase Progress (for SSE streaming) ---

export type InvestigationPhase = 0 | 1 | 2 | 3;

export interface PhaseProgress {
  phase: InvestigationPhase;
  step: string; // human-readable current sub-step
  complete: boolean;
}

// --- Full Report ---

export interface ForensicReport {
  caseId: string; // case-YYYYMMDD-XXXX (random 4 hex chars)
  mode: "token" | "prediction";
  subject: {
    address: string; // token address OR market/event ID
    name: string; // token name OR event title
    symbol: string; // token symbol OR outcome (e.g., "YES")
    chain: string;
    marketCapUsd?: number;
    priceUsd?: number;
    // PM-specific subject fields
    eventTitle?: string; // full Polymarket event title
    outcome?: string; // resolved outcome (e.g., "YES", "NO")
    resolutionDate?: string; // ISO date string of resolution
    marketId?: string; // Polymarket market ID
  };
  suspicionScore: number; // 0-100 (called "Insider Score" in PM mode)
  verdict: Verdict;
  anomaly: AnomalyWindow | null; // null if CLEAN or PM mode
  suspects: Suspect[]; // called "profiters" in PM mode UI
  clusters: SuspectCluster[];
  timeline: TimelineEvent[];
  graph: WalletGraph; // empty for PM mode (no trace)
  evidence: EvidenceItem[];
  narrative: AINarrative | null; // null until Phase 3 completes
  metadata: {
    creditsUsed: number;
    phasesCompleted: InvestigationPhase[];
    duration: number; // ms
    createdAt: number; // unix timestamp
    earlyExit: boolean; // true if no anomaly found
    degradedSections: string[]; // sections that failed gracefully
  };
}

// --- SSE Event Types ---

export type SSEEventType =
  | "phase_start"
  | "phase_complete"
  | "step_update"
  | "suspects_found"
  | "score_computed"
  | "report_complete"
  | "error";

export interface SSEEvent {
  type: SSEEventType;
  data: PhaseProgress | Partial<ForensicReport> | { message: string };
}

// --- Investigation Options ---

export interface TokenInvestigationOptions {
  tokenAddress: string;
  chain: string;
  skipCoinGeckoPrefilter?: boolean;
  onProgress?: (event: SSEEvent) => void;
}

// --- Prediction Market Investigation Options ---

export interface PredictionInvestigationOptions {
  eventId: string; // Polymarket event ID
  marketId?: string; // specific market within event (optional)
  onProgress?: (event: SSEEvent) => void;
}
