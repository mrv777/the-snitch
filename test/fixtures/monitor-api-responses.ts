/**
 * Monitor API response fixtures — represents what Nansen returns for
 * smart-money and PM endpoints used by the monitor watcher.
 * Captured once from real API patterns, reused forever in tests.
 */

import type {
  SmartMoneyDexTradeRow,
  SmartMoneyNetflowRow,
  PmMarketScreenerRow,
} from "@/lib/nansen/types";

// --- Smart Money DEX Trades ---

export const MOCK_SM_DEX_TRADES: SmartMoneyDexTradeRow[] = [
  {
    trader_address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    trader_address_label: "vitalik.eth",
    token_bought_address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
    token_bought_symbol: "PEPE",
    token_sold_address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    token_sold_symbol: "USDC",
    trade_value_usd: 500_000,
    block_timestamp: "2026-03-25T14:30:00Z",
    transaction_hash: "0xtx_sm_trade_1",
    chain: "ethereum",
  },
  {
    trader_address: "0x28C6c06298d514Db089934071355E5743bf21d60",
    trader_address_label: "Binance 14",
    token_sold_address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    token_sold_symbol: "WETH",
    token_bought_address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    token_bought_symbol: "USDC",
    trade_value_usd: 250_000,
    block_timestamp: "2026-03-25T13:15:00Z",
    transaction_hash: "0xtx_sm_trade_2",
    chain: "ethereum",
  },
  {
    trader_address: "0x1234567890abcdef1234567890abcdef12345678",
    token_bought_address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    token_bought_symbol: "USDT",
    token_sold_address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    token_sold_symbol: "USDC",
    trade_value_usd: 50_000, // below $100K threshold
    block_timestamp: "2026-03-25T12:00:00Z",
    transaction_hash: "0xtx_sm_trade_3",
    chain: "ethereum",
  },
  {
    trader_address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    trader_address_label: "Smart Money Whale",
    token_bought_address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    token_bought_symbol: "DAI",
    token_sold_address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    token_sold_symbol: "USDC",
    trade_value_usd: 150_000,
    block_timestamp: "2026-03-25T11:45:00Z",
    transaction_hash: "0xtx_sm_trade_4",
    chain: "ethereum",
  },
];

// --- Smart Money Netflow (current period) ---

export const MOCK_SM_NETFLOW_CURRENT: SmartMoneyNetflowRow[] = [
  {
    token_address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
    token_symbol: "PEPE",
    chain: "ethereum",
    net_flow_24h_usd: 1_500_000, // strong inflow
    trader_count: 12,
  },
  {
    token_address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    token_symbol: "WETH",
    chain: "ethereum",
    net_flow_24h_usd: -400_000, // outflow — was inflow previously → reversal
    trader_count: 8,
  },
  {
    token_address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    token_symbol: "DAI",
    chain: "ethereum",
    net_flow_24h_usd: 200_000,
    trader_count: 5,
  },
];

// --- Smart Money Netflow (previous period — for comparison) ---

export const MOCK_SM_NETFLOW_PREVIOUS: SmartMoneyNetflowRow[] = [
  {
    token_address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
    token_symbol: "PEPE",
    chain: "ethereum",
    net_flow_24h_usd: 200_000, // was inflow, still inflow → no reversal
    trader_count: 8,
  },
  {
    token_address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    token_symbol: "WETH",
    chain: "ethereum",
    net_flow_24h_usd: 500_000, // was inflow, now outflow → REVERSAL
    trader_count: 10,
  },
  {
    token_address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    token_symbol: "DAI",
    chain: "ethereum",
    net_flow_24h_usd: 100_000, // no reversal
    trader_count: 3,
  },
];

// --- PM Market Screener (current) ---

export const MOCK_PM_SCREENER_CURRENT: PmMarketScreenerRow[] = [
  {
    market_id: "mkt-btc-200k",
    title: "Will BTC hit $200K by June 2026?",
    volume_24h_usd: 5_000_000, // was 2M → 150% increase
    liquidity_usd: 10_000_000,
    outcome: "YES",
    end_date: "2026-06-30",
  },
  {
    market_id: "mkt-eth-10k",
    title: "Will ETH hit $10K in 2026?",
    volume_24h_usd: 800_000, // was 700K → 14% increase (below 30%)
    liquidity_usd: 3_000_000,
    outcome: undefined,
    end_date: "2026-12-31",
  },
  {
    market_id: "mkt-fed-rate",
    title: "Will the Fed cut rates in April 2026?",
    volume_24h_usd: 3_000_000, // was 1.5M → 100% increase
    liquidity_usd: 5_000_000,
    outcome: undefined,
    end_date: "2026-04-30",
  },
];

// --- PM Market Screener (previous) ---

export const MOCK_PM_SCREENER_PREVIOUS: PmMarketScreenerRow[] = [
  {
    market_id: "mkt-btc-200k",
    title: "Will BTC hit $200K by June 2026?",
    volume_24h_usd: 2_000_000,
    liquidity_usd: 10_000_000,
  },
  {
    market_id: "mkt-eth-10k",
    title: "Will ETH hit $10K in 2026?",
    volume_24h_usd: 700_000,
    liquidity_usd: 3_000_000,
  },
  {
    market_id: "mkt-fed-rate",
    title: "Will the Fed cut rates in April 2026?",
    volume_24h_usd: 1_500_000,
    liquidity_usd: 5_000_000,
  },
];
