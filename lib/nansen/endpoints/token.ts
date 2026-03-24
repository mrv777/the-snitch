import { nansenCli, nansenApi } from "../client";
import type {
  NansenCliResponse,
  TokenInfoResponse,
  TokenOhlcvRow,
  WhoBoughtSoldRow,
  FlowIntelligenceRow,
  DexTradeRow,
} from "../types";

type Chain = string;

// #14 — token info (10 credits on free plan)
export function tokenInfo(
  tokenAddress: string,
  chain: Chain
): Promise<NansenCliResponse<TokenInfoResponse>> {
  return nansenCli<TokenInfoResponse>(
    ["token", "info", "--token", tokenAddress, "--chain", chain],
    `token-info:${chain}:${tokenAddress}`
  );
}

// #13 — token ohlcv (10 credits on free plan)
// Uses REST API fallback (more reliable for OHLCV data)
export function tokenOhlcv(
  tokenAddress: string,
  chain: Chain,
  timeframe = "1d",
  days = 90
): Promise<NansenCliResponse<TokenOhlcvRow[]>> {
  const now = new Date();
  const from = new Date(now.getTime() - days * 86400000);
  return nansenApi<TokenOhlcvRow[]>(
    "/tgm/token-ohlcv",
    {
      token_address: tokenAddress,
      chain,
      timeframe,
      date: {
        from: from.toISOString(),
        to: now.toISOString(),
      },
    },
    `token-ohlcv:${chain}:${tokenAddress}:${timeframe}:${days}`
  );
}

// #11 — token who-bought-sold (10 credits on free plan)
export function tokenWhoBoughtSold(
  tokenAddress: string,
  chain: Chain,
  days = 30
): Promise<NansenCliResponse<WhoBoughtSoldRow[]>> {
  return nansenCli<WhoBoughtSoldRow[]>(
    [
      "token",
      "who-bought-sold",
      "--token",
      tokenAddress,
      "--chain",
      chain,
      "--days",
      String(days),
    ],
    `token-who-bought-sold:${chain}:${tokenAddress}:${days}`
  );
}

// #10 — token flow-intelligence (10 credits on free plan)
export function tokenFlowIntelligence(
  tokenAddress: string,
  chain: Chain,
  days = 30
): Promise<NansenCliResponse<FlowIntelligenceRow[]>> {
  return nansenCli<FlowIntelligenceRow[]>(
    [
      "token",
      "flow-intelligence",
      "--token",
      tokenAddress,
      "--chain",
      chain,
      "--days",
      String(days),
    ],
    `token-flow-intelligence:${chain}:${tokenAddress}:${days}`
  );
}

// #12 — token dex-trades (10 credits on free plan)
export function tokenDexTrades(
  tokenAddress: string,
  chain: Chain,
  days = 30
): Promise<NansenCliResponse<DexTradeRow[]>> {
  return nansenCli<DexTradeRow[]>(
    [
      "token",
      "dex-trades",
      "--token",
      tokenAddress,
      "--chain",
      chain,
      "--days",
      String(days),
    ],
    `token-dex-trades:${chain}:${tokenAddress}:${days}`
  );
}
