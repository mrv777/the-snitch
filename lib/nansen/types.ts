// --- Common ---

export interface NansenPagination {
  page: number;
  per_page: number;
  is_last_page: boolean;
}

export interface NansenCliResponse<T = unknown> {
  success: boolean;
  data: T;
  error?: string;
  code?: string;
  pagination?: NansenPagination;
}

// --- Profiler Domain ---

export interface SearchResult {
  entity_name: string;
}

export interface PnlSummaryResponse {
  top5_tokens: PnlTokenSummary[];
  traded_token_count: number;
  traded_times: number;
  realized_pnl_usd: number;
  realized_pnl_percent: number;
  win_rate: number;
}

export interface PnlTokenSummary {
  realized_pnl: number;
  realized_roi: number;
  token_address: string;
  token_symbol: string;
  chain: string;
}

export interface TransactionRow {
  chain: string;
  method: string;
  tokens_sent: TokenTransferInfo[];
  tokens_received: TokenTransferInfo[];
  volume_usd: number;
  block_timestamp: string;
  transaction_hash: string;
  source_type: string;
}

export interface TokenTransferInfo {
  token_address: string;
  token_symbol: string;
  token_amount: number;
  value_usd?: number;
}

export interface CounterpartyRow {
  counterparty_address: string;
  counterparty_name?: string;
  interaction_count: number;
  volume_usd: number;
}

export interface RelatedWalletRow {
  address: string;
  entity_name?: string;
  relationship_type?: string;
}

export interface PerpPositionRow {
  market: string;
  side: "long" | "short";
  size_usd: number;
  entry_price: number;
  mark_price: number;
  unrealized_pnl: number;
  leverage?: number;
}

// Profiler trace returns a flat graph
export interface TraceResult {
  root: string;
  chain: string;
  depth: number;
  nodes: string[]; // addresses
  edges: TraceEdge[];
  stats?: Record<string, unknown>;
}

export interface TraceEdge {
  from: string;
  to: string;
  volume_usd: number;
  tx_count?: number;
  hop?: number;
}

/** @deprecated Use TraceResult instead */
export type TraceNode = TraceResult;

// Profiler compare returns shared counterparties
export interface CompareResult {
  addresses: string[];
  chain: string;
  shared_counterparties: string[]; // array of addresses
  shared_tokens?: string[];
  balances?: { address: string; total_usd: number }[];
}

// Profiler batch response
export interface BatchProfileRow {
  address: string;
  chain: string;
  balance_usd?: number;
  pnl_summary?: PnlSummaryResponse;
}

// --- Token Domain ---

export interface TokenInfoResponse {
  token_address: string;
  token_symbol: string;
  token_name: string;
  chain: string;
  market_cap_usd?: number;
  price_usd?: number;
  holder_count?: number;
  volume_24h_usd?: number;
}

export interface TokenOhlcvRow {
  interval_start: string;
  /** @deprecated alias — use interval_start */
  timestamp?: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number;
  volume_usd?: number | null;
}

export interface WhoBoughtSoldRow {
  address: string;
  address_label?: string;
  bought_token_volume?: number;
  sold_token_volume?: number;
  token_trade_volume?: number;
  bought_volume_usd?: number;
  sold_volume_usd?: number;
  trade_volume_usd?: number;
}

export interface FlowIntelligenceRow {
  public_figure_net_flow_usd?: number;
  public_figure_avg_flow_usd?: number;
  public_figure_wallet_count?: number;
  top_pnl_net_flow_usd?: number;
  top_pnl_avg_flow_usd?: number;
  top_pnl_wallet_count?: number;
  whale_net_flow_usd?: number;
  whale_avg_flow_usd?: number;
  whale_wallet_count?: number;
  smart_trader_net_flow_usd?: number;
  smart_trader_avg_flow_usd?: number;
  smart_trader_wallet_count?: number;
  exchange_net_flow_usd?: number;
  exchange_avg_flow_usd?: number;
  exchange_wallet_count?: number;
  fresh_wallets_net_flow_usd?: number;
  fresh_wallets_avg_flow_usd?: number;
  fresh_wallets_wallet_count?: number;
}

export interface DexTradeRow {
  block_timestamp: string;
  transaction_hash: string;
  trader_address: string;
  trader_address_label?: string;
  action: string; // "BUY" | "SELL"
  token_address: string;
  token_name?: string;
  token_amount: number;
  traded_token_address: string;
  traded_token_name?: string;
  traded_token_amount: number;
  estimated_swap_price_usd?: number;
  estimated_value_usd: number;
}

// --- Smart Money Domain ---

export interface SmartMoneyDexTradeRow {
  chain?: string;
  block_timestamp: string;
  transaction_hash?: string;
  trader_address: string;
  trader_address_label?: string;
  token_bought_address?: string;
  token_sold_address?: string;
  token_bought_symbol?: string;
  token_sold_symbol?: string;
  token_bought_amount?: number;
  token_sold_amount?: number;
  token_bought_age_days?: number;
  token_sold_age_days?: number;
  token_bought_market_cap?: number;
  token_sold_market_cap?: number;
  token_bought_fdv?: number;
  token_sold_fdv?: number;
  trade_value_usd?: number;
}

export interface SmartMoneyNetflowRow {
  token_address: string;
  token_symbol: string;
  chain: string;
  net_flow_1h_usd?: number;
  net_flow_24h_usd?: number;
  net_flow_7d_usd?: number;
  net_flow_30d_usd?: number;
  token_sectors?: string;
  trader_count?: number;
  token_age_days?: number;
  market_cap_usd?: number;
}

// --- Prediction Market Domain ---

export interface PmPnlByMarketRow {
  address: string;
  entity_name?: string;
  realized_pnl_usd: number;
  position_size_usd?: number;
  outcome?: string;
}

export interface PmPnlByAddressRow {
  market_id: string;
  market_title?: string;
  realized_pnl_usd: number;
  outcome?: string;
  resolved_at?: string;
}

export interface PmTradeRow {
  market_id: string;
  market_title?: string;
  side: string;
  price: number;
  size_usd: number;
  block_timestamp: string;
  transaction_hash?: string;
}

export interface PmTopHolderRow {
  address: string;
  entity_name?: string;
  position_size_usd: number;
  side: string;
  entry_price?: number;
}

export interface PmMarketScreenerRow {
  market_id: string;
  title: string;
  volume_24h_usd?: number;
  liquidity_usd?: number;
  outcome?: string;
  end_date?: string;
}

export interface PmEventScreenerRow {
  event_id: string;
  title: string;
  status: string;
  outcome?: string;
  resolution_date?: string;
  markets?: { market_id: string; title: string }[];
}
