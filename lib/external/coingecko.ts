const CG_BASE = "https://api.coingecko.com/api/v3";

// CoinGecko platform IDs for our supported chains
const CHAIN_TO_PLATFORM: Record<string, string> = {
  ethereum: "ethereum",
  base: "base",
  solana: "solana",
};

export interface CoinGeckoTokenPrice {
  usd: number;
  usd_24h_change: number;
}

export interface CoinGeckoSearchResult {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number | null;
  thumb: string;
  platforms?: Record<string, string>;
}

/**
 * Fetch current token price + 24h change from CoinGecko free API.
 * Returns null if token not found or API fails (non-blocking pre-filter).
 */
export async function getTokenPrice(
  tokenAddress: string,
  chain: string
): Promise<CoinGeckoTokenPrice | null> {
  const platform = CHAIN_TO_PLATFORM[chain];
  if (!platform) return null;

  try {
    const res = await fetch(
      `${CG_BASE}/simple/token_price/${platform}?contract_addresses=${tokenAddress}&vs_currencies=usd&include_24hr_change=true`,
      { signal: AbortSignal.timeout(5_000) }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const entry = data[tokenAddress.toLowerCase()];
    if (!entry) return null;

    return {
      usd: entry.usd,
      usd_24h_change: entry.usd_24h_change ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Search tokens by name via CoinGecko free API.
 * Used for the token name search dropdown on the frontend.
 */
export async function searchTokens(
  query: string
): Promise<CoinGeckoSearchResult[]> {
  try {
    const res = await fetch(
      `${CG_BASE}/search?query=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(5_000) }
    );

    if (!res.ok) return [];

    const data = await res.json();
    return (data.coins ?? []).slice(0, 10) as CoinGeckoSearchResult[];
  } catch {
    return [];
  }
}

/**
 * Dynamic anomaly threshold based on market cap.
 * Larger tokens need smaller moves to trigger investigation.
 *
 * >$100M market cap: 20% move
 * $1M-$100M: 50% move
 * <$1M: 100% move
 */
export function getAnomalyThreshold(marketCapUsd: number | undefined): number {
  if (!marketCapUsd) return 50; // default mid-cap
  if (marketCapUsd > 100_000_000) return 20;
  if (marketCapUsd > 1_000_000) return 50;
  return 100;
}

/**
 * Pre-filter: should we investigate this token?
 * Returns { shouldInvestigate, reason } — never blocks, just advises.
 */
export async function prefilterToken(
  tokenAddress: string,
  chain: string
): Promise<{ shouldInvestigate: boolean; reason: string }> {
  const price = await getTokenPrice(tokenAddress, chain);

  if (!price) {
    // CoinGecko doesn't know this token — likely very new or micro-cap, worth investigating
    return {
      shouldInvestigate: true,
      reason: "Token not found on CoinGecko — may be new or micro-cap",
    };
  }

  const absChange = Math.abs(price.usd_24h_change);

  // Use a moderate threshold for pre-filter (different from anomaly detection)
  // We just want to catch obvious stablecoins and dead tokens
  if (absChange < 5) {
    return {
      shouldInvestigate: false,
      reason: `Low recent volatility (${absChange.toFixed(1)}% 24h change). This token hasn't had notable price action recently.`,
    };
  }

  return {
    shouldInvestigate: true,
    reason: `${absChange.toFixed(1)}% 24h price change detected`,
  };
}
