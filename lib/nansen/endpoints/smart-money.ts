import { nansenCli } from "../client";
import type {
  NansenCliResponse,
  SmartMoneyDexTradeRow,
  SmartMoneyNetflowRow,
} from "../types";

type Chain = string;

// #15 — smart-money dex-trades (50 credits on free plan)
export function smartMoneyDexTrades(
  chain: Chain
): Promise<NansenCliResponse<SmartMoneyDexTradeRow[]>> {
  return nansenCli<SmartMoneyDexTradeRow[]>(
    ["smart-money", "dex-trades", "--chain", chain],
    `smart-money-dex-trades:${chain}`
  );
}

// #16 — smart-money netflow (50 credits on free plan)
export function smartMoneyNetflow(
  chain: Chain
): Promise<NansenCliResponse<SmartMoneyNetflowRow[]>> {
  return nansenCli<SmartMoneyNetflowRow[]>(
    ["smart-money", "netflow", "--chain", chain],
    `smart-money-netflow:${chain}`
  );
}
