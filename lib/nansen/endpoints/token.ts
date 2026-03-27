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
// The CLI returns a nested object: { data: { name, symbol, token_details: { market_cap_usd }, ... } }
// We flatten it into our TokenInfoResponse shape.
export async function tokenInfo(
  tokenAddress: string,
  chain: Chain
): Promise<NansenCliResponse<TokenInfoResponse>> {
  const res = await nansenCli<Record<string, unknown>>(
    ["token", "info", "--token", tokenAddress, "--chain", chain],
    `token-info:${chain}:${tokenAddress}`
  );

  if (!res.success || !res.data) return { ...res, data: null as unknown as TokenInfoResponse };

  // The CLI unwrapper may leave a nested `data` object for non-array responses
  const raw = (res.data as Record<string, unknown>).data ?? res.data;
  const info = raw as Record<string, unknown>;
  const details = (info.token_details ?? {}) as Record<string, unknown>;
  const metrics = (info.spot_metrics ?? {}) as Record<string, unknown>;

  return {
    success: true,
    data: {
      token_address: (info.contract_address as string) ?? tokenAddress,
      token_name: (info.name as string) ?? "Unknown",
      token_symbol: (info.symbol as string) ?? "???",
      chain,
      market_cap_usd: (details.market_cap_usd as number) ?? undefined,
      price_usd: (info.price_usd as number) ?? undefined,
      holder_count: (metrics.total_holders as number) ?? undefined,
      volume_24h_usd: (metrics.volume_total_usd as number) ?? undefined,
    },
  };
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
