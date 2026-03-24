import { nansenCli } from "../client";
import type {
  NansenCliResponse,
  SearchResult,
  PnlSummaryResponse,
  TransactionRow,
  CounterpartyRow,
  RelatedWalletRow,
  PerpPositionRow,
  TraceNode,
  CompareResult,
  BatchProfileRow,
} from "../types";

type Chain = string;

// #9 — profiler search (0 credits)
export function profilerSearch(
  query: string
): Promise<NansenCliResponse<SearchResult[]>> {
  return nansenCli<SearchResult[]>(
    ["profiler", "search", "--query", query],
    `profiler-search:${query}`
  );
}

// #7 — profiler pnl-summary (10 credits on free plan)
export function profilerPnlSummary(
  address: string,
  chain: Chain,
  days = 365
): Promise<NansenCliResponse<PnlSummaryResponse>> {
  return nansenCli<PnlSummaryResponse>(
    [
      "profiler",
      "pnl-summary",
      "--address",
      address,
      "--chain",
      chain,
      "--days",
      String(days),
    ],
    `profiler-pnl-summary:${chain}:${address}:${days}`
  );
}

// #4 — profiler transactions (10 credits on free plan)
export function profilerTransactions(
  address: string,
  chain: Chain,
  days = 30
): Promise<NansenCliResponse<TransactionRow[]>> {
  return nansenCli<TransactionRow[]>(
    [
      "profiler",
      "transactions",
      "--address",
      address,
      "--chain",
      chain,
      "--days",
      String(days),
    ],
    `profiler-transactions:${chain}:${address}:${days}`
  );
}

// #5 — profiler counterparties (50 credits on free plan)
export function profilerCounterparties(
  address: string,
  chain: Chain,
  days = 30
): Promise<NansenCliResponse<CounterpartyRow[]>> {
  return nansenCli<CounterpartyRow[]>(
    [
      "profiler",
      "counterparties",
      "--address",
      address,
      "--chain",
      chain,
      "--days",
      String(days),
    ],
    `profiler-counterparties:${chain}:${address}:${days}`
  );
}

// #6 — profiler related-wallets (10 credits on free plan)
export function profilerRelatedWallets(
  address: string,
  chain: Chain
): Promise<NansenCliResponse<RelatedWalletRow[]>> {
  return nansenCli<RelatedWalletRow[]>(
    ["profiler", "related-wallets", "--address", address, "--chain", chain],
    `profiler-related-wallets:${chain}:${address}`
  );
}

// #8 — profiler perp-positions (10 credits on free plan)
// Skip for tokens with <$10M market cap
export function profilerPerpPositions(
  address: string
): Promise<NansenCliResponse<PerpPositionRow[]>> {
  return nansenCli<PerpPositionRow[]>(
    ["profiler", "perp-positions", "--address", address],
    `profiler-perp-positions:${address}`
  );
}

// #1 — profiler trace (~50 credits/hop on free plan)
// Depth 2 for top suspect, depth 1 for others
export function profilerTrace(
  address: string,
  chain: Chain,
  depth = 1,
  width = 3
): Promise<NansenCliResponse<TraceNode>> {
  return nansenCli<TraceNode>(
    [
      "profiler",
      "trace",
      "--address",
      address,
      "--chain",
      chain,
      "--depth",
      String(depth),
      "--width",
      String(width),
    ],
    `profiler-trace:${chain}:${address}:d${depth}:w${width}`
  );
}

// #3 — profiler compare (~50-100 credits on free plan)
// Always use when ≥2 suspects found
export function profilerCompare(
  addressA: string,
  addressB: string,
  chain: Chain
): Promise<NansenCliResponse<CompareResult>> {
  return nansenCli<CompareResult>(
    [
      "profiler",
      "compare",
      "--addresses",
      `${addressA},${addressB}`,
      "--chain",
      chain,
    ],
    `profiler-compare:${chain}:${addressA}:${addressB}`
  );
}

// #2 — profiler batch (10-20 credits/addr on free plan)
// Do NOT include labels (too expensive)
export function profilerBatch(
  addresses: string[],
  chain: Chain,
  include: string[] = ["balance", "pnl-summary"]
): Promise<NansenCliResponse<BatchProfileRow[]>> {
  return nansenCli<BatchProfileRow[]>(
    [
      "profiler",
      "batch",
      "--addresses",
      addresses.join(","),
      "--chain",
      chain,
      "--include",
      include.join(","),
    ],
    `profiler-batch:${chain}:${addresses.sort().join(",")}:${include.join(",")}`
  );
}
