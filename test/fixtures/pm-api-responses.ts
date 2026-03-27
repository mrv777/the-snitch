/**
 * PM API response fixtures — represents what Nansen returns.
 * Captured once from real API calls, reused forever in tests.
 */

import type {
  PmEventScreenerRow,
  PmPnlByMarketRow,
  PmTopHolderRow,
  PmTradeRow,
  PnlSummaryResponse,
  RelatedWalletRow,
} from "@/lib/nansen/types";

// --- Event Screener ---

export const MOCK_PM_EVENTS: PmEventScreenerRow[] = [
  {
    event_id: "evt-btc-200k-june-2026",
    title: "Will BTC hit $200K by June 2026?",
    status: "resolved",
    outcome: "YES",
    resolution_date: "2026-03-15T00:00:00Z",
    markets: [
      { market_id: "mkt-btc-200k-yes", title: "BTC $200K YES/NO" },
    ],
  },
  {
    event_id: "evt-eth-10k-2026",
    title: "Will ETH hit $10K in 2026?",
    status: "resolved",
    outcome: "NO",
    resolution_date: "2026-03-10T00:00:00Z",
    markets: [
      { market_id: "mkt-eth-10k-yes", title: "ETH $10K YES/NO" },
    ],
  },
  {
    event_id: "evt-fed-rate-cut",
    title: "Will the Fed cut rates in March 2026?",
    status: "resolved",
    outcome: "YES",
    resolution_date: "2026-03-19T00:00:00Z",
    markets: [
      { market_id: "mkt-fed-cut-yes", title: "Fed Rate Cut YES/NO" },
    ],
  },
];

// --- PnL by Market (for BTC $200K event) ---

export const MOCK_PNL_BY_MARKET: PmPnlByMarketRow[] = [
  {
    address: "0xa3f1234567890abcdef1234567890abcdef123456",
    entity_name: "Alpha Fund",
    realized_pnl_usd: 340_000,
    position_size_usd: 200_000,
    outcome: "YES",
  },
  {
    address: "0x7bc234567890abcdef1234567890abcdef234567",
    realized_pnl_usd: 180_000,
    position_size_usd: 150_000,
    outcome: "YES",
  },
  {
    address: "0xd1e234567890abcdef1234567890abcdef345678",
    entity_name: "Frequent Trader",
    realized_pnl_usd: 95_000,
    position_size_usd: 80_000,
    outcome: "YES",
  },
  {
    address: "0xeee234567890abcdef1234567890abcdef456789",
    realized_pnl_usd: 50_000,
    position_size_usd: 40_000,
    outcome: "YES",
  },
  {
    address: "0xfff234567890abcdef1234567890abcdef567890",
    realized_pnl_usd: -20_000,
    position_size_usd: 30_000,
    outcome: "NO",
  },
];

// --- Top Holders ---

export const MOCK_TOP_HOLDERS: PmTopHolderRow[] = [
  {
    address: "0xa3f1234567890abcdef1234567890abcdef123456",
    entity_name: "Alpha Fund",
    position_size_usd: 200_000,
    side: "YES",
    entry_price: 0.12,
  },
  {
    address: "0x7bc234567890abcdef1234567890abcdef234567",
    position_size_usd: 150_000,
    side: "YES",
    entry_price: 0.2,
  },
  {
    address: "0xd1e234567890abcdef1234567890abcdef345678",
    entity_name: "Frequent Trader",
    position_size_usd: 80_000,
    side: "YES",
    entry_price: 0.35,
  },
];

// --- Trades by Address (Alpha Fund) ---

export const MOCK_ALPHA_FUND_TRADES: PmTradeRow[] = [
  {
    market_id: "mkt-btc-200k-yes",
    market_title: "BTC $200K YES/NO",
    side: "YES",
    price: 0.12,
    size_usd: 200_000,
    block_timestamp: "2026-02-22T14:30:00Z", // ~21 days before resolution
    transaction_hash: "0xtx1aaa",
  },
];

// --- Trades by Address (0x7bc...) ---

export const MOCK_SECOND_PROFITER_TRADES: PmTradeRow[] = [
  {
    market_id: "mkt-btc-200k-yes",
    market_title: "BTC $200K YES/NO",
    side: "YES",
    price: 0.2,
    size_usd: 150_000,
    block_timestamp: "2026-03-01T10:00:00Z", // ~14 days before resolution
    transaction_hash: "0xtx2bbb",
  },
];

// --- PnL Summaries (profiler) ---

export const MOCK_ALPHA_FUND_PNL: PnlSummaryResponse = {
  top5_tokens: [],
  traded_token_count: 42,
  traded_times: 180,
  realized_pnl_usd: 1_200_000,
  realized_pnl_percent: 340,
  win_rate: 85,
};

export const MOCK_SECOND_PROFITER_PNL: PnlSummaryResponse = {
  top5_tokens: [],
  traded_token_count: 28,
  traded_times: 95,
  realized_pnl_usd: 450_000,
  realized_pnl_percent: 210,
  win_rate: 72,
};

// --- Related Wallets ---

export const MOCK_ALPHA_FUND_RELATED: RelatedWalletRow[] = [
  {
    address: "0x7bc234567890abcdef1234567890abcdef234567",
    relationship_type: "same_entity",
  },
  {
    address: "0xfunding0000000000000000000000000000000001",
    entity_name: "Funding Source",
    relationship_type: "funding",
  },
];

export const MOCK_SECOND_PROFITER_RELATED: RelatedWalletRow[] = [
  {
    address: "0xa3f1234567890abcdef1234567890abcdef123456",
    entity_name: "Alpha Fund",
    relationship_type: "same_entity",
  },
];
