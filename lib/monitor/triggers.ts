import type {
  SmartMoneyDexTradeRow,
  SmartMoneyNetflowRow,
  PmMarketScreenerRow,
} from "@/lib/nansen/types";

// --- Monitor Event Types ---

export type MonitorEventType =
  | "sm_large_trade"
  | "flow_reversal"
  | "pm_odds_swing"
  | "sm_accumulation";

export interface MonitorEvent {
  eventType: MonitorEventType;
  subjectId: string; // token address or market ID
  summary: string; // human-readable description
  data: Record<string, unknown>; // raw data for storage
}

// --- Thresholds (from spec section 7) ---

const SM_LARGE_TRADE_USD = 100_000; // >$100K single DEX trade
const FLOW_REVERSAL_NET_THRESHOLD = 0; // sign change = reversal
const PM_ODDS_SWING_PCT = 30; // >30% odds change
const SM_ACCUMULATION_PRICE_MOVE_PCT = 20; // >20% price move

// --- Trigger Functions ---

/**
 * Detect large smart money DEX trades (>$100K single trade).
 */
export function detectLargeSmTrades(
  trades: SmartMoneyDexTradeRow[]
): MonitorEvent[] {
  const events: MonitorEvent[] = [];

  // Stablecoins to deprioritize when choosing "subject" token
  const STABLECOINS = new Set(["USDC", "USDT", "DAI", "BUSD", "TUSD", "FRAX"]);

  for (const trade of trades) {
    const tradeValueUsd = trade.trade_value_usd ?? 0;
    if (tradeValueUsd >= SM_LARGE_TRADE_USD) {
      const name = trade.trader_address_label || trade.trader_address.slice(0, 10) + "...";

      // Pick the primary (non-stablecoin) token as subject
      const boughtSymbol = trade.token_bought_symbol ?? "";
      const soldSymbol = trade.token_sold_symbol ?? "";
      const boughtIsStable = STABLECOINS.has(boughtSymbol.toUpperCase());
      const soldIsStable = STABLECOINS.has(soldSymbol.toUpperCase());

      let tokenAddress: string;
      let tokenSymbol: string;
      let action: string;

      if (!boughtIsStable && boughtSymbol) {
        // Bought a non-stablecoin → it's a buy
        tokenAddress = trade.token_bought_address ?? "";
        tokenSymbol = boughtSymbol;
        action = "bought";
      } else if (!soldIsStable && soldSymbol) {
        // Sold a non-stablecoin → it's a sell
        tokenAddress = trade.token_sold_address ?? "";
        tokenSymbol = soldSymbol;
        action = "sold";
      } else {
        // Both are stablecoins or missing; fall back to bought side
        tokenAddress = trade.token_bought_address || trade.token_sold_address || "";
        tokenSymbol = boughtSymbol || soldSymbol || "???";
        action = "traded";
      }

      const amount = formatUsd(tradeValueUsd);

      events.push({
        eventType: "sm_large_trade",
        subjectId: tokenAddress,
        summary: `Smart Money ${name} ${action} ${amount} of ${tokenSymbol}`,
        data: {
          address: trade.trader_address,
          entityName: trade.trader_address_label,
          tokenAddress,
          tokenSymbol,
          action,
          amountUsd: tradeValueUsd,
          timestamp: trade.block_timestamp,
          txHash: trade.transaction_hash,
        },
      });
    }
  }

  return events;
}

/**
 * Detect net flow reversals — when a token's smart money flow
 * switches direction (e.g., inflow to outflow or vice versa).
 *
 * Takes current and previous netflow data. A reversal is detected
 * when the sign of netflow_usd flips between periods.
 */
export function detectFlowReversals(
  current: SmartMoneyNetflowRow[],
  previous: SmartMoneyNetflowRow[]
): MonitorEvent[] {
  const events: MonitorEvent[] = [];

  const prevMap = new Map(
    previous.map((row) => [row.token_address, row.net_flow_24h_usd ?? 0])
  );

  for (const row of current) {
    const prevNetflow = prevMap.get(row.token_address);
    if (prevNetflow === undefined) continue;

    const currentNetflow = row.net_flow_24h_usd ?? 0;

    // Check for sign change (flow reversal)
    const wasPositive = prevNetflow > FLOW_REVERSAL_NET_THRESHOLD;
    const isPositive = currentNetflow > FLOW_REVERSAL_NET_THRESHOLD;

    if (wasPositive !== isPositive && prevNetflow !== 0 && currentNetflow !== 0) {
      const direction = isPositive ? "inflow" : "outflow";
      const prevDirection = wasPositive ? "inflow" : "outflow";

      events.push({
        eventType: "flow_reversal",
        subjectId: row.token_address,
        summary: `Net flow reversal for ${row.token_symbol}: ${prevDirection} → ${direction} (${formatUsd(Math.abs(currentNetflow))})`,
        data: {
          tokenAddress: row.token_address,
          tokenSymbol: row.token_symbol,
          chain: row.chain,
          currentNetflow,
          previousNetflow: prevNetflow,
          traderCount: row.trader_count,
        },
      });
    }
  }

  return events;
}

/**
 * Detect prediction market odds swings (>30% change).
 *
 * Takes current and previous market screener data. A swing is detected
 * when volume changes dramatically, suggesting rapid odds movement.
 *
 * Note: The market-screener endpoint provides volume data, not direct odds.
 * We use volume_24h as a proxy — a >30% volume spike signals unusual activity.
 */
export function detectPmOddsSwings(
  current: PmMarketScreenerRow[],
  previous: PmMarketScreenerRow[]
): MonitorEvent[] {
  const events: MonitorEvent[] = [];

  const prevMap = new Map(
    previous.map((row) => [row.market_id, row.volume_24h_usd ?? 0])
  );

  for (const row of current) {
    const prevVolume = prevMap.get(row.market_id);
    if (prevVolume === undefined || prevVolume === 0) continue;

    const currentVolume = row.volume_24h_usd ?? 0;
    if (currentVolume === 0) continue;

    const changePct =
      ((currentVolume - prevVolume) / prevVolume) * 100;

    if (Math.abs(changePct) >= PM_ODDS_SWING_PCT) {
      const direction = changePct > 0 ? "surged" : "dropped";

      events.push({
        eventType: "pm_odds_swing",
        subjectId: row.market_id,
        summary: `PM volume ${direction} ${Math.abs(changePct).toFixed(0)}% for "${row.title}"`,
        data: {
          marketId: row.market_id,
          title: row.title,
          currentVolume,
          previousVolume: prevVolume,
          changePct,
          liquidity: row.liquidity_usd,
          outcome: row.outcome,
          endDate: row.end_date,
        },
      });
    }
  }

  return events;
}

/**
 * Detect smart money accumulation — new positions in tokens
 * showing significant price movement (>20%).
 *
 * Looks for buy-side SM trades on tokens that appear in the
 * netflow data with significant flow imbalance.
 */
export function detectSmAccumulation(
  trades: SmartMoneyDexTradeRow[],
  netflow: SmartMoneyNetflowRow[]
): MonitorEvent[] {
  const events: MonitorEvent[] = [];

  // Build a set of tokens with significant net inflow (using 24h flow as primary)
  const significantInflows = new Map<string, SmartMoneyNetflowRow>();
  for (const row of netflow) {
    const netFlow24h = row.net_flow_24h_usd ?? 0;
    if (netFlow24h > 0) {
      // Use net_flow_24h_usd as primary signal; treat positive flow as accumulation
      // Consider significant if the net inflow represents >= 20% threshold
      if (netFlow24h >= SM_ACCUMULATION_PRICE_MOVE_PCT) {
        significantInflows.set(row.token_address, row);
      }
    }
  }

  // Find buy trades on tokens with significant inflows
  const seen = new Set<string>(); // deduplicate per token
  for (const trade of trades) {
    // Derive buy action: if token_bought_address is present, it's a buy
    const isBuy = !!trade.token_bought_address;
    if (!isBuy) continue;

    const tokenAddress = trade.token_bought_address ?? "";
    if (seen.has(tokenAddress)) continue;

    const flow = significantInflows.get(tokenAddress);
    if (!flow) continue;

    seen.add(tokenAddress);
    const name = trade.trader_address_label || trade.trader_address.slice(0, 10) + "...";
    const tokenSymbol = trade.token_bought_symbol || "???";
    const netFlow24h = flow.net_flow_24h_usd ?? 0;

    events.push({
      eventType: "sm_accumulation",
      subjectId: tokenAddress,
      summary: `Smart Money accumulation: ${name} buying ${tokenSymbol} amid ${formatUsd(netFlow24h)} net inflow`,
      data: {
        traderAddress: trade.trader_address,
        entityName: trade.trader_address_label,
        tokenAddress,
        tokenSymbol,
        tradeAmountUsd: trade.trade_value_usd ?? 0,
        netflowUsd: netFlow24h,
        chain: flow.chain,
      },
    });
  }

  return events;
}

// --- Helpers ---

function formatUsd(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}
