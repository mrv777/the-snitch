import type { ForensicReport } from "@/lib/forensics/types";

/**
 * A complete ForensicReport fixture for prediction market mode.
 * Scenario: Polymarket event "Will BTC hit $200K by June 2026?" resolved YES.
 * 3 profiters found, 2 clustered as related wallets.
 *
 * Captured once, reused across all PM frontend tests.
 */
export const MOCK_PM_REPORT: ForensicReport = {
  caseId: "case-20260325-pm01",
  mode: "prediction",
  subject: {
    address: "pm-market-btc-200k-june-2026",
    name: "Will BTC hit $200K by June 2026?",
    symbol: "YES",
    chain: "polygon",
    eventTitle: "Will BTC hit $200K by June 2026?",
    outcome: "YES",
    resolutionDate: "2026-03-15T00:00:00Z",
    marketId: "pm-market-btc-200k-june-2026",
  },
  suspicionScore: 78,
  verdict: "SUSPICIOUS",
  anomaly: null, // PM mode doesn't use anomaly detection
  suspects: [
    {
      address: "0xa3f1234567890abcdef1234567890abcdef123456",
      entityName: "Alpha Fund",
      rank: 1,
      score: 340_000,
      timingAdvantage: 504, // 21 days in hours
      volumeUsd: 200_000,
      action: "buy",
      isDexVisible: false,
      pnlUsd: 340_000,
      pnlPercent: 170,
      winRate: 85,
    },
    {
      address: "0x7bc234567890abcdef1234567890abcdef234567",
      rank: 2,
      score: 180_000,
      timingAdvantage: 336, // 14 days
      volumeUsd: 150_000,
      action: "buy",
      isDexVisible: false,
      pnlUsd: 180_000,
      pnlPercent: 120,
      winRate: 72,
    },
    {
      address: "0xd1e234567890abcdef1234567890abcdef345678",
      entityName: "Frequent Trader",
      rank: 3,
      score: 95_000,
      timingAdvantage: 168, // 7 days
      volumeUsd: 80_000,
      action: "buy",
      isDexVisible: false,
      pnlUsd: 95_000,
      pnlPercent: 118.75,
    },
  ],
  clusters: [
    {
      suspects: [
        {
          address: "0xa3f1234567890abcdef1234567890abcdef123456",
          entityName: "Alpha Fund",
          rank: 1,
          score: 340_000,
          timingAdvantage: 504,
          volumeUsd: 200_000,
          action: "buy",
          isDexVisible: false,
        },
        {
          address: "0x7bc234567890abcdef1234567890abcdef234567",
          rank: 2,
          score: 180_000,
          timingAdvantage: 336,
          volumeUsd: 150_000,
          action: "buy",
          isDexVisible: false,
        },
      ],
      connectionType: "related_wallets",
      description:
        "Alpha Fund and 0x7bc234... flagged as related wallets",
    },
  ],
  timeline: [
    {
      timestamp: 1773552000, // T-21d
      relativeLabel: "T-21d",
      type: "position_entry",
      actor: "Alpha Fund",
      description: "Alpha Fund bought $200K YES at $0.12",
      volumeUsd: 200_000,
    },
    {
      timestamp: 1774156800, // T-14d
      relativeLabel: "T-14d",
      type: "position_entry",
      actor: "0x7bc2...4567",
      description: "0x7bc2...4567 bought $150K YES at $0.20",
      volumeUsd: 150_000,
    },
    {
      timestamp: 1774761600, // T-7d
      relativeLabel: "T-7d",
      type: "position_entry",
      actor: "Frequent Trader",
      description: "Frequent Trader bought $80K YES at $0.35",
      volumeUsd: 80_000,
    },
    {
      timestamp: 1775280000, // T-1d
      relativeLabel: "T-1d",
      type: "odds_movement",
      description: "YES odds surge from 0.40 to 0.85",
    },
    {
      timestamp: 1775366400, // T-0 (resolution)
      relativeLabel: "T-0",
      type: "event_resolution",
      description: 'Event resolved: "Will BTC hit $200K by June 2026?" → YES',
    },
  ],
  graph: { nodes: [], edges: [] }, // No wallet graph in PM mode
  evidence: [
    {
      factor: "position_timing",
      weight: 0.35,
      subScore: 100,
      weightedScore: 35,
      description:
        "Top profiter (Alpha Fund) entered position 21 days before resolution",
    },
    {
      factor: "profit_magnitude",
      weight: 0.25,
      subScore: 80,
      weightedScore: 20,
      description:
        "Top profiter earned $340,000 from this market",
    },
    {
      factor: "profit_concentration",
      weight: 0.2,
      subScore: 70,
      weightedScore: 14,
      description:
        "Top 3 profiters captured 45.2% of total market profits",
    },
    {
      factor: "wallet_connections",
      weight: 0.1,
      subScore: 50,
      weightedScore: 5,
      description:
        "2 profiters flagged as related by Nansen",
    },
    {
      factor: "track_record",
      weight: 0.1,
      subScore: 70,
      weightedScore: 7,
      description:
        "Top profiter has 85% historical win rate across all trades",
    },
  ],
  narrative: {
    caseNarrative:
      'Three weeks before the Polymarket event "Will BTC hit $200K by June 2026?" resolved YES, a wallet identified as Alpha Fund quietly entered a $200K position at $0.12 per YES share.\n\nA second wallet (0x7bc2...4567), flagged by Nansen as related to Alpha Fund, followed with a $150K position one week later at $0.20. A third entity, Frequent Trader, entered at $0.35 just 7 days before resolution.\n\nThe combined profit of these three wallets totaled $615K, representing 45% of total market profits. Alpha Fund alone extracted $340K — a 170% return. The timing pattern shows progressively later entries at higher prices, consistent with a coordinated information cascade.\n\nThe fact that the top two profiters are flagged as related wallets significantly strengthens the insider trading hypothesis. While skilled forecasting can explain individual wins, the combination of early timing, large positions, connected wallets, and an 85% historical win rate warrants closer scrutiny.\n\nDid someone know? The evidence suggests they might have.',
    keyFindings: [
      "Alpha Fund entered $200K position 21 days before YES resolution",
      "Top 2 profiters flagged as related wallets by Nansen",
      "Combined $615K profit (45% of total market) across 3 wallets",
    ],
    shareableLine:
      "PM: Alpha Fund earned $340K on BTC $200K prediction — entered 21 days early. Insider Score: 78/100.",
    verdictLabel: "SUSPICIOUS",
  },
  metadata: {
    creditsUsed: 380,
    phasesCompleted: [0, 1, 2, 3],
    duration: 35_000,
    createdAt: 1775366400,
    earlyExit: false,
    degradedSections: [],
  },
};

/**
 * A minimal CLEAN PM report fixture (no profiters found).
 */
export const MOCK_CLEAN_PM_REPORT: ForensicReport = {
  caseId: "case-20260325-pm02",
  mode: "prediction",
  subject: {
    address: "pm-market-rain-tomorrow",
    name: "Will it rain in NYC tomorrow?",
    symbol: "NO",
    chain: "polygon",
    eventTitle: "Will it rain in NYC tomorrow?",
    outcome: "NO",
    resolutionDate: "2026-03-24T00:00:00Z",
    marketId: "pm-market-rain-tomorrow",
  },
  suspicionScore: 0,
  verdict: "CLEAN",
  anomaly: null,
  suspects: [],
  clusters: [],
  timeline: [],
  graph: { nodes: [], edges: [] },
  evidence: [],
  narrative: null,
  metadata: {
    creditsUsed: 150,
    phasesCompleted: [0, 1],
    duration: 5_000,
    createdAt: 1775280000,
    earlyExit: true,
    degradedSections: ["no_profiters"],
  },
};
