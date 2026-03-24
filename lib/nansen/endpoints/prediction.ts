import { nansenCli } from "../client";
import type {
  NansenCliResponse,
  PmPnlByMarketRow,
  PmPnlByAddressRow,
  PmTradeRow,
  PmTopHolderRow,
  PmMarketScreenerRow,
  PmEventScreenerRow,
} from "../types";

// #17 — prediction-market pnl-by-market (~10-50 credits est.)
export function pmPnlByMarket(
  marketId: string
): Promise<NansenCliResponse<PmPnlByMarketRow[]>> {
  return nansenCli<PmPnlByMarketRow[]>(
    ["prediction-market", "pnl-by-market", "--market-id", marketId],
    `pm-pnl-by-market:${marketId}`
  );
}

// #18 — prediction-market pnl-by-address (~10-50 credits est.)
export function pmPnlByAddress(
  address: string
): Promise<NansenCliResponse<PmPnlByAddressRow[]>> {
  return nansenCli<PmPnlByAddressRow[]>(
    ["prediction-market", "pnl-by-address", "--address", address],
    `pm-pnl-by-address:${address}`
  );
}

// #19 — prediction-market trades-by-address (~10-50 credits est.)
export function pmTradesByAddress(
  address: string
): Promise<NansenCliResponse<PmTradeRow[]>> {
  return nansenCli<PmTradeRow[]>(
    ["prediction-market", "trades-by-address", "--address", address],
    `pm-trades-by-address:${address}`
  );
}

// #20 — prediction-market top-holders (~10-50 credits est.)
export function pmTopHolders(
  marketId: string
): Promise<NansenCliResponse<PmTopHolderRow[]>> {
  return nansenCli<PmTopHolderRow[]>(
    ["prediction-market", "top-holders", "--market-id", marketId],
    `pm-top-holders:${marketId}`
  );
}

// #21 — prediction-market market-screener (~10-50 credits est.)
export function pmMarketScreener(): Promise<
  NansenCliResponse<PmMarketScreenerRow[]>
> {
  return nansenCli<PmMarketScreenerRow[]>(
    ["prediction-market", "market-screener"],
    `pm-market-screener`
  );
}

// #22 — prediction-market event-screener (~10-50 credits est.)
export function pmEventScreener(): Promise<
  NansenCliResponse<PmEventScreenerRow[]>
> {
  return nansenCli<PmEventScreenerRow[]>(
    ["prediction-market", "event-screener"],
    `pm-event-screener`
  );
}
