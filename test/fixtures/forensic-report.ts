import type { ForensicReport } from "@/lib/forensics/types";

/**
 * A complete ForensicReport fixture with realistic data.
 * Captured once, reused across all frontend tests.
 *
 * Scenario: $PEPE token on Ethereum with a 40% pump.
 * 3 suspects found, 2 clustered via shared counterparties.
 */
export const MOCK_REPORT: ForensicReport = {
  caseId: "case-20260323-a1b2",
  mode: "token",
  subject: {
    address: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
    name: "Pepe",
    symbol: "PEPE",
    chain: "ethereum",
    marketCapUsd: 3_200_000_000,
    priceUsd: 0.0000089,
  },
  suspicionScore: 72,
  verdict: "SUSPICIOUS",
  anomaly: {
    date: "2026-03-20T00:00:00Z",
    timestamp: 1774243200,
    priceChangePct: 40.2,
    direction: "pump",
    openPrice: 0.0000063,
    closePrice: 0.0000089,
    highPrice: 0.0000095,
    lowPrice: 0.000006,
    volume: 180_000_000,
  },
  suspects: [
    {
      address: "0xa3f1234567890abcdef1234567890abcdef123456",
      entityName: "Whale Alpha",
      label: "Smart Trader",
      rank: 1,
      score: 340,
      timingAdvantage: 6.2,
      volumeUsd: 800_000,
      action: "buy",
      isDexVisible: true,
      pnlUsd: 420_000,
      pnlPercent: 52.5,
      winRate: 72,
    },
    {
      address: "0x7bc234567890abcdef1234567890abcdef234567",
      rank: 2,
      score: 180,
      timingAdvantage: 5.1,
      volumeUsd: 600_000,
      action: "buy",
      isDexVisible: true,
      pnlUsd: 290_000,
      pnlPercent: 48.3,
      winRate: 65,
    },
    {
      address: "0xd1e234567890abcdef1234567890abcdef345678",
      entityName: "Market Maker X",
      rank: 3,
      score: 95,
      timingAdvantage: 4.0,
      volumeUsd: 1_000_000,
      action: "both",
      isDexVisible: true,
      pnlUsd: 150_000,
      pnlPercent: 15.0,
    },
  ],
  clusters: [
    {
      suspects: [
        {
          address: "0xa3f1234567890abcdef1234567890abcdef123456",
          entityName: "Whale Alpha",
          label: "Smart Trader",
          rank: 1,
          score: 340,
          timingAdvantage: 6.2,
          volumeUsd: 800_000,
          action: "buy",
          isDexVisible: true,
        },
        {
          address: "0x7bc234567890abcdef1234567890abcdef234567",
          rank: 2,
          score: 180,
          timingAdvantage: 5.1,
          volumeUsd: 600_000,
          action: "buy",
          isDexVisible: true,
        },
      ],
      connectionType: "shared_counterparties",
      description:
        "Whale Alpha and 0x7bc234... share 3 counterparties",
    },
  ],
  timeline: [
    {
      timestamp: 1774220880,
      relativeLabel: "T-6h",
      type: "suspect_buy",
      actor: "Whale Alpha",
      description: "bought $800K",
      volumeUsd: 800_000,
    },
    {
      timestamp: 1774224480,
      relativeLabel: "T-5h",
      type: "suspect_buy",
      actor: "0x7bc234...4567",
      description: "bought $600K",
      volumeUsd: 600_000,
    },
    {
      timestamp: 1774228080,
      relativeLabel: "T-4h",
      type: "suspect_buy",
      actor: "Market Maker X",
      description: "bought $1.0M",
      volumeUsd: 1_000_000,
    },
    {
      timestamp: 1774235280,
      relativeLabel: "T-2h",
      type: "smart_money_activity",
      actor: "Smart Money Composite",
      description: "net flow turns positive",
    },
    {
      timestamp: 1774243200,
      relativeLabel: "T-0",
      type: "price_move",
      description: "Price surged +40.2%",
    },
    {
      timestamp: 1774246800,
      relativeLabel: "T+1h",
      type: "suspect_sell",
      actor: "Whale Alpha",
      description: "sold $1.2M (+50%)",
      volumeUsd: 1_200_000,
    },
    {
      timestamp: 1774254000,
      relativeLabel: "T+3h",
      type: "suspect_sell",
      actor: "0x7bc234...4567",
      description: "sold $900K (+50%)",
      volumeUsd: 900_000,
    },
  ],
  graph: {
    nodes: [
      {
        id: "0xa3f1234567890abcdef1234567890abcdef123456",
        label: "Whale Alpha",
        type: "suspect",
        suspectRank: 1,
        entityName: "Whale Alpha",
      },
      {
        id: "0x7bc234567890abcdef1234567890abcdef234567",
        label: "0x7bc2...4567",
        type: "suspect",
        suspectRank: 2,
      },
      {
        id: "0xd1e234567890abcdef1234567890abcdef345678",
        label: "Market Maker X",
        type: "suspect",
        suspectRank: 3,
        entityName: "Market Maker X",
      },
      {
        id: "0xfunding0000000000000000000000000000000001",
        label: "0xfund...0001",
        type: "funding_source",
      },
      {
        id: "0xbinance0000000000000000000000000000000001",
        label: "Binance Hot Wallet",
        type: "exchange",
        entityName: "Binance",
      },
    ],
    edges: [
      {
        source: "0xfunding0000000000000000000000000000000001",
        target: "0xa3f1234567890abcdef1234567890abcdef123456",
        type: "funding",
        label: "Funded 2 days prior",
        volumeUsd: 500_000,
      },
      {
        source: "0xfunding0000000000000000000000000000000001",
        target: "0x7bc234567890abcdef1234567890abcdef234567",
        type: "funding",
        label: "Funded 2 days prior",
        volumeUsd: 300_000,
      },
      {
        source: "0xa3f1234567890abcdef1234567890abcdef123456",
        target: "0x7bc234567890abcdef1234567890abcdef234567",
        type: "shared_counterparty",
      },
      {
        source: "0xd1e234567890abcdef1234567890abcdef345678",
        target: "0xbinance0000000000000000000000000000000001",
        type: "transaction",
        volumeUsd: 2_000_000,
      },
    ],
  },
  evidence: [
    {
      factor: "timing",
      weight: 0.3,
      subScore: 80,
      weightedScore: 24,
      description:
        "3 wallets bought $2.4M worth 4-6 hours before the 40% price surge",
      details: "Timing advantage ranges from T-4h to T-6h before the anomaly peak",
    },
    {
      factor: "volume_concentration",
      weight: 0.2,
      subScore: 70,
      weightedScore: 14,
      description:
        "Top 3 wallets accounted for 38% of pre-move trading volume",
    },
    {
      factor: "wallet_connections",
      weight: 0.2,
      subScore: 70,
      weightedScore: 14,
      description:
        "Suspects #1 and #2 share 3 counterparties and trace to the same funding source",
    },
    {
      factor: "smart_money_labels",
      weight: 0.15,
      subScore: 70,
      weightedScore: 10.5,
      description: 'Suspect #1 carries Nansen "Smart Trader" label',
    },
    {
      factor: "profit_magnitude",
      weight: 0.15,
      subScore: 60,
      weightedScore: 9,
      description:
        "Combined realized profit of $860K across top suspects (~5x typical average)",
    },
  ],
  narrative: {
    caseNarrative:
      "On March 20, 2026, $PEPE experienced a sharp 40.2% price surge within a single trading day. Our analysis identified three wallets that accumulated significant positions in the hours leading up to this move.\n\nThe primary suspect, operating under the Nansen label \"Smart Trader\" (0xa3f1...3456), executed an $800K buy order approximately 6 hours before the pump. A second wallet (0x7bc2...4567) followed with a $600K purchase one hour later. Both wallets trace to the same funding source and share three common counterparties — a pattern highly correlated with coordinated trading.\n\nA third entity, identified as Market Maker X, entered a $1M position at T-4 hours. While market makers routinely take positions, the timing alignment with the other two suspects warrants further investigation.\n\nPost-pump, Suspects #1 and #2 liquidated their positions within 3 hours, realizing combined profits of approximately $710K — a 50% return in under 12 hours. This rapid buy-pump-sell pattern is consistent with informed trading behavior.\n\nThe evidence suggests a high degree of coordination between at least two of the three identified wallets. While intent cannot be proven from on-chain data alone, the timing precision, shared infrastructure, and profit extraction pattern warrant closer scrutiny.",
    keyFindings: [
      "3 wallets bought $2.4M worth 4-6 hours before 40% pump",
      "Suspects #1 and #2 trace to same funding source",
      "Combined $710K profit extracted within 3 hours post-pump",
    ],
    shareableLine:
      "$PEPE: 3 connected wallets bought $2.4M pre-pump, extracted $710K profit in hours. Suspicion Score: 72/100.",
    verdictLabel: "SUSPICIOUS",
  },
  metadata: {
    creditsUsed: 580,
    phasesCompleted: [0, 1, 2, 3],
    duration: 42_000,
    createdAt: 1774243200,
    earlyExit: false,
    degradedSections: [],
  },
};

/**
 * A minimal CLEAN report fixture (early exit, no anomaly).
 */
export const MOCK_CLEAN_REPORT: ForensicReport = {
  caseId: "case-20260323-c1d2",
  mode: "token",
  subject: {
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    name: "USD Coin",
    symbol: "USDC",
    chain: "ethereum",
    marketCapUsd: 32_000_000_000,
    priceUsd: 1.0,
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
    creditsUsed: 30,
    phasesCompleted: [0],
    duration: 3_000,
    createdAt: 1774243200,
    earlyExit: true,
    degradedSections: [],
  },
};
