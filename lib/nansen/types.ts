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

// Profiler trace returns a tree of hops
export interface TraceNode {
  address: string;
  entity_name?: string;
  label?: string;
  depth: number;
  children?: TraceNode[];
  transactions?: TraceTransaction[];
}

export interface TraceTransaction {
  from: string;
  to: string;
  value_usd: number;
  token_symbol?: string;
  block_timestamp: string;
  transaction_hash: string;
}

// Profiler compare returns shared counterparties
export interface CompareResult {
  address_a: string;
  address_b: string;
  shared_counterparties: SharedCounterparty[];
  common_tokens?: string[];
}

export interface SharedCounterparty {
  address: string;
  entity_name?: string;
  interaction_count_a: number;
  interaction_count_b: number;
  volume_usd_a: number;
  volume_usd_b: number;
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
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface WhoBoughtSoldRow {
  address: string;
  entity_name?: string;
  label?: string;
  action: "buy" | "sell";
  amount: number;
  value_usd: number;
}

export interface FlowIntelligenceRow {
  entity_type: string;
  entity_name?: string;
  direction: "inflow" | "outflow";
  volume_usd: number;
  transaction_count: number;
  date?: string;
}

export interface DexTradeRow {
  maker_address: string;
  maker_name?: string;
  taker_address: string;
  taker_name?: string;
  token_bought: string;
  token_sold: string;
  amount_usd: number;
  block_timestamp: string;
  transaction_hash: string;
  dex_name?: string;
}

// --- Smart Money Domain ---

export interface SmartMoneyDexTradeRow {
  address: string;
  entity_name?: string;
  token_address: string;
  token_symbol: string;
  action: "buy" | "sell";
  amount_usd: number;
  block_timestamp: string;
  transaction_hash?: string;
}

export interface SmartMoneyNetflowRow {
  token_address: string;
  token_symbol: string;
  chain: string;
  inflow_usd: number;
  outflow_usd: number;
  netflow_usd: number;
  smart_money_count?: number;
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
