import { randomBytes } from "crypto";
import type {
  ForensicReport,
  AnomalyWindow,
  Suspect,
  SuspectCluster,
  SSEEvent,
  TokenInvestigationOptions,
} from "./types";
import { scoreToVerdict } from "./types";
import { getAnomalyThreshold } from "@/lib/external/coingecko";
import { computeSuspicionScore } from "./suspicion-scorer";
import { buildTimeline } from "./timeline-builder";
import { buildWalletGraph } from "./graph-builder";
import { recordCredits, canAfford } from "@/lib/budget/tracker";
import { saveInvestigation } from "@/lib/cache/queries";
import { generateNarrative } from "./narrative-generator";

// Nansen endpoints
import { tokenInfo, tokenOhlcv, tokenWhoBoughtSold, tokenFlowIntelligence, tokenDexTrades } from "@/lib/nansen/endpoints/token";
import { smartMoneyDexTrades, smartMoneyNetflow } from "@/lib/nansen/endpoints/smart-money";
import { profilerTrace, profilerRelatedWallets, profilerPnlSummary, profilerPerpPositions, profilerCompare } from "@/lib/nansen/endpoints/profiler";

import type {
  NansenCliResponse,
  TokenInfoResponse,
  TokenOhlcvRow,
  WhoBoughtSoldRow,
  FlowIntelligenceRow,
  DexTradeRow,
  SmartMoneyDexTradeRow,
  SmartMoneyNetflowRow,
  TraceNode,
  RelatedWalletRow,
  PnlSummaryResponse,
  PerpPositionRow,
  CompareResult,
} from "@/lib/nansen/types";

// --- Constants ---

const OVERALL_TIMEOUT = 60_000; // 60s total
const RETRY_DELAY = 2_000; // 2s retry delay
const ESTIMATED_FULL_COST = 600; // credits for a full investigation
const PHASE_0_COST = 30;
const PHASE_1_COST = 120;

// --- Case ID Generator ---

function generateCaseId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const hex = randomBytes(2).toString("hex");
  return `case-${date}-${hex}`;
}

// --- Main Investigator ---

export async function investigateToken(
  options: TokenInvestigationOptions
): Promise<ForensicReport> {
  const { tokenAddress, chain, onProgress } = options;
  const startTime = Date.now();
  const caseId = generateCaseId();
  const degradedSections: string[] = [];
  let creditsUsed = 0;
  const phasesCompleted: (0 | 1 | 2 | 3)[] = [];

  const emit = (event: SSEEvent) => onProgress?.(event);

  // Budget check
  if (!canAfford(ESTIMATED_FULL_COST)) {
    throw new Error("CREDITS_EXHAUSTED");
  }

  // Create abort controller for overall timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OVERALL_TIMEOUT);

  try {
    // ===== PHASE 0: RECON =====
    emit({
      type: "phase_start",
      data: { phase: 0, step: "Scanning price history...", complete: false },
    });

    const phase0 = await runPhase0(tokenAddress, chain);
    creditsUsed += PHASE_0_COST;
    recordCredits(PHASE_0_COST);
    phasesCompleted.push(0);

    emit({
      type: "phase_complete",
      data: { phase: 0, step: "Recon complete", complete: true },
    });

    // Anomaly detection
    const anomaly = detectAnomaly(
      phase0.ohlcv,
      phase0.tokenInfo?.market_cap_usd
    );

    // EARLY EXIT if no anomaly
    if (!anomaly) {
      const cleanReport = buildCleanReport(
        caseId,
        tokenAddress,
        chain,
        phase0,
        creditsUsed,
        startTime,
        phasesCompleted
      );
      saveReportToDb(cleanReport);
      emit({ type: "report_complete", data: cleanReport });
      return cleanReport;
    }

    // ===== PHASE 1: SUSPECT IDENTIFICATION =====
    emit({
      type: "phase_start",
      data: { phase: 1, step: "Identifying suspects...", complete: false },
    });

    const phase1 = await runPhase1(tokenAddress, chain);
    creditsUsed += PHASE_1_COST;
    recordCredits(PHASE_1_COST);
    phasesCompleted.push(1);

    emit({
      type: "step_update",
      data: { phase: 1, step: "Analyzing trading patterns...", complete: false },
    });

    // Rank suspects
    const suspects = rankSuspects(
      phase0.whoBoughtSold,
      phase1.dexTrades,
      phase1.flowIntelligence,
      phase1.smartMoneyDexTrades,
      anomaly,
      tokenAddress
    );

    emit({
      type: "suspects_found",
      data: { suspects } as unknown as Partial<ForensicReport>,
    });

    emit({
      type: "phase_complete",
      data: { phase: 1, step: "Suspects identified", complete: true },
    });

    // ===== PHASE 2: DEEP PROFILING =====
    emit({
      type: "phase_start",
      data: { phase: 2, step: "Tracing wallet connections...", complete: false },
    });

    const marketCap = phase0.tokenInfo?.market_cap_usd;
    const phase2 = await runPhase2(
      suspects,
      chain,
      marketCap,
      degradedSections
    );
    creditsUsed += phase2.creditsUsed;
    recordCredits(phase2.creditsUsed);
    phasesCompleted.push(2);

    emit({
      type: "phase_complete",
      data: { phase: 2, step: "Profiling complete", complete: true },
    });

    // Enrich suspects with PnL data
    enrichSuspects(suspects, phase2);

    // Build clusters
    const clusters = buildClusters(
      suspects,
      phase2.compareResult,
      phase2.relatedWallets,
      phase2.traceData
    );

    // ===== PHASE 3: ANALYSIS + REPORT =====
    emit({
      type: "phase_start",
      data: { phase: 3, step: "Analyzing evidence...", complete: false },
    });

    // Compute pre-move volume
    const totalPreMoveVolume = computePreMoveVolume(
      phase1.dexTrades,
      anomaly,
      tokenAddress
    );

    // Suspicion score
    const { score, evidence } = computeSuspicionScore({
      suspects,
      clusters,
      totalPreMoveVolume,
      whoBoughtSold: phase0.whoBoughtSold,
      hasConnectionData:
        !!phase2.traceData || !!phase2.compareResult || phase2.relatedWallets.size > 0,
    });

    const verdict = scoreToVerdict(score);

    emit({
      type: "score_computed",
      data: { suspicionScore: score, verdict } as unknown as Partial<ForensicReport>,
    });

    // Timeline
    const timeline = buildTimeline({
      anomaly,
      suspects,
      dexTrades: phase1.dexTrades,
      smartMoneyTrades: phase1.smartMoneyDexTrades,
      tokenAddress,
    });

    // Graph
    const graph = buildWalletGraph({
      suspects,
      traceData: phase2.traceData,
      relatedWallets: phase2.relatedWallets,
      compareResult: phase2.compareResult,
    });

    emit({
      type: "step_update",
      data: { phase: 3, step: "Generating intelligence report...", complete: false },
    });

    // Assemble partial report for narrative generation
    const partialReport: ForensicReport = {
      caseId,
      mode: "token",
      subject: {
        address: tokenAddress,
        name: phase0.tokenInfo?.token_name || "Unknown",
        symbol: phase0.tokenInfo?.token_symbol || "???",
        chain,
        marketCapUsd: marketCap,
        priceUsd: phase0.tokenInfo?.price_usd,
      },
      suspicionScore: score,
      verdict,
      anomaly,
      suspects,
      clusters,
      timeline,
      graph,
      evidence,
      narrative: null,
      metadata: {
        creditsUsed,
        phasesCompleted,
        duration: Date.now() - startTime,
        createdAt: Math.floor(Date.now() / 1000),
        earlyExit: false,
        degradedSections,
      },
    };

    // Generate AI narrative
    let narrative = null;
    try {
      narrative = await generateNarrative(partialReport);
    } catch (err) {
      console.error("Narrative generation failed:", err);
      degradedSections.push("narrative");
    }

    phasesCompleted.push(3);

    const report: ForensicReport = {
      ...partialReport,
      narrative,
      metadata: {
        ...partialReport.metadata,
        phasesCompleted,
        duration: Date.now() - startTime,
      },
    };

    saveReportToDb(report);

    emit({
      type: "phase_complete",
      data: { phase: 3, step: "Report complete", complete: true },
    });
    emit({ type: "report_complete", data: report });

    return report;
  } finally {
    clearTimeout(timeout);
  }
}

// ===== PHASE RUNNERS =====

interface Phase0Result {
  tokenInfo: TokenInfoResponse | null;
  ohlcv: TokenOhlcvRow[];
  whoBoughtSold: WhoBoughtSoldRow[];
}

async function runPhase0(
  tokenAddress: string,
  chain: string
): Promise<Phase0Result> {
  const [infoRes, ohlcvRes, wbsRes] = await Promise.all([
    tokenInfo(tokenAddress, chain),
    tokenOhlcv(tokenAddress, chain, "1d", 90),
    tokenWhoBoughtSold(tokenAddress, chain),
  ]);

  return {
    tokenInfo: infoRes.success ? infoRes.data : null,
    ohlcv: ohlcvRes.success ? ohlcvRes.data : [],
    whoBoughtSold: wbsRes.success ? wbsRes.data : [],
  };
}

interface Phase1Result {
  flowIntelligence: FlowIntelligenceRow[];
  dexTrades: DexTradeRow[];
  smartMoneyDexTrades: SmartMoneyDexTradeRow[];
  smartMoneyNetflow: SmartMoneyNetflowRow[];
}

async function runPhase1(
  tokenAddress: string,
  chain: string
): Promise<Phase1Result> {
  const [flowRes, dexRes, smDexRes, smNetRes] = await Promise.all([
    tokenFlowIntelligence(tokenAddress, chain),
    tokenDexTrades(tokenAddress, chain),
    smartMoneyDexTrades(chain),
    smartMoneyNetflow(chain),
  ]);

  return {
    flowIntelligence: flowRes.success ? flowRes.data : [],
    dexTrades: dexRes.success ? dexRes.data : [],
    smartMoneyDexTrades: smDexRes.success ? smDexRes.data : [],
    smartMoneyNetflow: smNetRes.success ? smNetRes.data : [],
  };
}

interface Phase2Result {
  traceData: TraceNode | undefined;
  relatedWallets: Map<string, RelatedWalletRow[]>;
  pnlSummaries: Map<string, PnlSummaryResponse>;
  perpPositions: PerpPositionRow[] | undefined;
  compareResult: CompareResult | undefined;
  creditsUsed: number;
}

async function runPhase2(
  suspects: Suspect[],
  chain: string,
  marketCap: number | undefined,
  degradedSections: string[]
): Promise<Phase2Result> {
  let creditsUsed = 0;
  let traceData: TraceNode | undefined;
  const relatedWallets = new Map<string, RelatedWalletRow[]>();
  const pnlSummaries = new Map<string, PnlSummaryResponse>();
  let perpPositions: PerpPositionRow[] | undefined;
  let compareResult: CompareResult | undefined;

  if (suspects.length === 0) {
    return { traceData, relatedWallets, pnlSummaries, perpPositions, compareResult, creditsUsed };
  }

  const topSuspect = suspects[0];

  // Build parallel call list
  const calls: Promise<void>[] = [];

  // Top suspect: depth 2 trace
  calls.push(
    retryOnce(() => profilerTrace(topSuspect.address, chain, 2, 3)).then(
      (res) => {
        if (res.success) {
          traceData = res.data;
          creditsUsed += 400; // ~400 credits for depth 2
        } else {
          degradedSections.push("trace");
          creditsUsed += 50; // partial attempt
        }
      }
    )
  );

  // Top suspect: related wallets
  calls.push(
    retryOnce(() => profilerRelatedWallets(topSuspect.address, chain)).then(
      (res) => {
        if (res.success) {
          relatedWallets.set(topSuspect.address.toLowerCase(), res.data);
        }
        creditsUsed += 10;
      }
    )
  );

  // All suspects: PnL summaries
  for (const suspect of suspects) {
    calls.push(
      retryOnce(() => profilerPnlSummary(suspect.address, chain)).then(
        (res) => {
          if (res.success) {
            pnlSummaries.set(suspect.address.toLowerCase(), res.data);
          }
          creditsUsed += 10;
        }
      )
    );
  }

  // Conditional: perp positions (only if market cap >$10M)
  if (marketCap && marketCap > 10_000_000) {
    calls.push(
      retryOnce(() => profilerPerpPositions(topSuspect.address)).then(
        (res) => {
          if (res.success) {
            perpPositions = res.data;
          }
          creditsUsed += 10;
        }
      )
    );
  }

  // Conditional: compare (only if ≥2 suspects)
  if (suspects.length >= 2) {
    calls.push(
      retryOnce(() =>
        profilerCompare(suspects[0].address, suspects[1].address, chain)
      ).then((res) => {
        if (res.success) {
          compareResult = res.data;
        }
        creditsUsed += 100;
      })
    );
  }

  // Suspects #2/#3: related-wallets only (skip trace)
  for (const suspect of suspects.slice(1, 3)) {
    calls.push(
      retryOnce(() => profilerRelatedWallets(suspect.address, chain)).then(
        (res) => {
          if (res.success) {
            relatedWallets.set(suspect.address.toLowerCase(), res.data);
          }
          creditsUsed += 10;
        }
      )
    );
  }

  await Promise.all(calls);

  return { traceData, relatedWallets, pnlSummaries, perpPositions, compareResult, creditsUsed };
}

// ===== ANOMALY DETECTION =====

export function detectAnomaly(
  ohlcv: TokenOhlcvRow[],
  marketCap: number | undefined
): AnomalyWindow | null {
  if (ohlcv.length === 0) return null;

  const threshold = getAnomalyThreshold(marketCap);

  // Find the most extreme daily move that exceeds threshold
  let bestAnomaly: AnomalyWindow | null = null;
  let bestAbsChange = 0;

  for (const candle of ohlcv) {
    if (candle.open === 0) continue;
    const changePct = ((candle.close - candle.open) / candle.open) * 100;
    const absChange = Math.abs(changePct);

    if (absChange >= threshold && absChange > bestAbsChange) {
      bestAbsChange = absChange;
      bestAnomaly = {
        date: candle.timestamp,
        timestamp: Math.floor(Date.parse(candle.timestamp) / 1000),
        priceChangePct: changePct,
        direction: changePct > 0 ? "pump" : "dump",
        openPrice: candle.open,
        closePrice: candle.close,
        highPrice: candle.high,
        lowPrice: candle.low,
        volume: candle.volume,
      };
    }
  }

  return bestAnomaly;
}

// ===== SUSPECT RANKING =====

interface AddressScore {
  address: string;
  entityName?: string;
  label?: string;
  score: number;
  volumeUsd: number;
  timingAdvantage: number; // hours before anomaly
  action: "buy" | "sell" | "both";
  isDexVisible: boolean;
  sources: Set<string>;
}

export function rankSuspects(
  whoBoughtSold: WhoBoughtSoldRow[],
  dexTrades: DexTradeRow[],
  flowIntelligence: FlowIntelligenceRow[],
  smartMoneyTrades: SmartMoneyDexTradeRow[],
  anomaly: AnomalyWindow,
  tokenAddress: string
): Suspect[] {
  const scoreMap = new Map<string, AddressScore>();
  const tokenLower = tokenAddress.toLowerCase();

  // Helper to get or create an address score entry
  const getEntry = (address: string): AddressScore => {
    const addr = address.toLowerCase();
    if (!scoreMap.has(addr)) {
      scoreMap.set(addr, {
        address: addr,
        score: 0,
        volumeUsd: 0,
        timingAdvantage: 0,
        action: "buy",
        isDexVisible: false,
        sources: new Set(),
      });
    }
    return scoreMap.get(addr)!;
  };

  // 1. Merge from who-bought-sold
  for (const row of whoBoughtSold) {
    const entry = getEntry(row.address);
    entry.volumeUsd += row.value_usd;
    entry.action = row.action;
    entry.entityName = entry.entityName || row.entity_name;
    entry.label = entry.label || row.label;
    entry.sources.add("who-bought-sold");
  }

  // 2. Merge from dex-trades (provides DEX visibility + intraday timing)
  for (const trade of dexTrades) {
    const isBuy = trade.token_bought.toLowerCase() === tokenLower;
    const addr = isBuy ? trade.taker_address : trade.maker_address;
    const name = isBuy ? trade.taker_name : trade.maker_name;

    const entry = getEntry(addr);
    entry.volumeUsd += trade.amount_usd;
    entry.isDexVisible = true;
    entry.entityName = entry.entityName || name;
    entry.sources.add("dex-trades");

    // Compute timing advantage (hours before anomaly)
    const tradeTs = Date.parse(trade.block_timestamp) / 1000;
    const hoursBeforeAnomaly = (anomaly.timestamp - tradeTs) / 3600;
    if (hoursBeforeAnomaly > 0 && hoursBeforeAnomaly > entry.timingAdvantage) {
      entry.timingAdvantage = hoursBeforeAnomaly;
    }

    // Determine action direction
    if (isBuy) {
      entry.action = entry.action === "sell" ? "both" : "buy";
    } else {
      entry.action = entry.action === "buy" ? "both" : "sell";
    }
  }

  // 3. Merge from flow-intelligence (entity-level, may not have addresses)
  // Flow intelligence provides entity types rather than specific addresses,
  // so we use it to enrich existing entries
  for (const flow of flowIntelligence) {
    if (flow.entity_name) {
      // Try to find matching address from other sources
      for (const entry of scoreMap.values()) {
        if (
          entry.entityName?.toLowerCase() === flow.entity_name.toLowerCase()
        ) {
          entry.sources.add("flow-intelligence");
        }
      }
    }
  }

  // 4. Check smart money trades for the same token
  for (const trade of smartMoneyTrades) {
    if (trade.token_address.toLowerCase() !== tokenLower) continue;

    const entry = getEntry(trade.address);
    entry.volumeUsd += trade.amount_usd;
    entry.isDexVisible = true;
    entry.entityName = entry.entityName || trade.entity_name;
    entry.sources.add("smart-money");

    const tradeTs = Date.parse(trade.block_timestamp) / 1000;
    const hoursBeforeAnomaly = (anomaly.timestamp - tradeTs) / 3600;
    if (hoursBeforeAnomaly > 0 && hoursBeforeAnomaly > entry.timingAdvantage) {
      entry.timingAdvantage = hoursBeforeAnomaly;
    }
  }

  // 5. Compute composite score: timingAdvantage × volume, DEX-visible 1.5x
  for (const entry of scoreMap.values()) {
    const timingFactor = Math.min(entry.timingAdvantage, 72); // cap at 72h
    const volumeFactor = Math.log10(Math.max(entry.volumeUsd, 1));
    const dexMultiplier = entry.isDexVisible ? 1.5 : 1.0;
    entry.score = timingFactor * volumeFactor * dexMultiplier;
  }

  // 6. Sort by score descending, take top 3
  const ranked = Array.from(scoreMap.values())
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return ranked.map((s, i) => ({
    address: s.address,
    entityName: s.entityName,
    label: s.label,
    rank: i + 1,
    score: s.score,
    timingAdvantage: s.timingAdvantage,
    volumeUsd: s.volumeUsd,
    action: s.action,
    isDexVisible: s.isDexVisible,
  }));
}

// ===== SUSPECT ENRICHMENT =====

function enrichSuspects(suspects: Suspect[], phase2: Phase2Result): void {
  for (const suspect of suspects) {
    const addr = suspect.address.toLowerCase();

    // PnL data
    const pnl = phase2.pnlSummaries.get(addr);
    if (pnl) {
      suspect.pnlUsd = pnl.realized_pnl_usd;
      suspect.pnlPercent = pnl.realized_pnl_percent;
      suspect.winRate = pnl.win_rate;
    }

    // Perp positions (only for top suspect)
    if (suspect.rank === 1 && phase2.perpPositions) {
      suspect.perpPositions = phase2.perpPositions.map((p) => ({
        market: p.market,
        side: p.side,
        sizeUsd: p.size_usd,
        unrealizedPnl: p.unrealized_pnl,
      }));
    }
  }
}

// ===== CLUSTER BUILDING =====

function buildClusters(
  suspects: Suspect[],
  compareResult: CompareResult | undefined,
  relatedWallets: Map<string, RelatedWalletRow[]>,
  traceData: TraceNode | undefined
): SuspectCluster[] {
  const clusters: SuspectCluster[] = [];
  if (suspects.length < 2) return clusters;

  const suspectAddrs = new Set(suspects.map((s) => s.address.toLowerCase()));

  // Check compare result for shared counterparties
  if (compareResult && compareResult.shared_counterparties.length > 0) {
    const a = suspects.find(
      (s) => s.address.toLowerCase() === compareResult.address_a.toLowerCase()
    );
    const b = suspects.find(
      (s) => s.address.toLowerCase() === compareResult.address_b.toLowerCase()
    );
    if (a && b) {
      clusters.push({
        suspects: [a, b],
        connectionType: "shared_counterparties",
        description: `${a.entityName || a.address.slice(0, 10)} and ${b.entityName || b.address.slice(0, 10)} share ${compareResult.shared_counterparties.length} counterpart${compareResult.shared_counterparties.length > 1 ? "ies" : "y"}`,
      });
    }
  }

  // Check related wallets for overlap
  for (const [ownerAddr, related] of relatedWallets) {
    for (const rel of related) {
      if (suspectAddrs.has(rel.address.toLowerCase()) && ownerAddr !== rel.address.toLowerCase()) {
        const owner = suspects.find(
          (s) => s.address.toLowerCase() === ownerAddr
        );
        const relSuspect = suspects.find(
          (s) => s.address.toLowerCase() === rel.address.toLowerCase()
        );
        if (owner && relSuspect) {
          // Avoid duplicate clusters
          const alreadyClustered = clusters.some(
            (c) =>
              c.suspects.includes(owner) && c.suspects.includes(relSuspect)
          );
          if (!alreadyClustered) {
            clusters.push({
              suspects: [owner, relSuspect],
              connectionType: "related_wallets",
              description: `${owner.entityName || owner.address.slice(0, 10)} and ${relSuspect.entityName || relSuspect.address.slice(0, 10)} flagged as related wallets`,
            });
          }
        }
      }
    }
  }

  // Check trace data for same funding source
  if (traceData && traceData.children) {
    const fundingSources = new Set<string>();
    collectFundingSources(traceData, fundingSources);

    // If multiple suspects share a funding source via trace
    for (const [ownerAddr, related] of relatedWallets) {
      for (const rel of related) {
        if (fundingSources.has(rel.address.toLowerCase())) {
          const owner = suspects.find(
            (s) => s.address.toLowerCase() === ownerAddr
          );
          if (owner) {
            // Check if another suspect also connects to this funding source
            for (const [otherAddr, otherRelated] of relatedWallets) {
              if (otherAddr === ownerAddr) continue;
              const otherConnected = otherRelated.some(
                (r) => r.address.toLowerCase() === rel.address.toLowerCase()
              );
              if (otherConnected) {
                const otherSuspect = suspects.find(
                  (s) => s.address.toLowerCase() === otherAddr
                );
                if (otherSuspect) {
                  const alreadyClustered = clusters.some(
                    (c) =>
                      c.connectionType === "same_funding" &&
                      c.suspects.includes(owner) &&
                      c.suspects.includes(otherSuspect)
                  );
                  if (!alreadyClustered) {
                    clusters.push({
                      suspects: [owner, otherSuspect],
                      connectionType: "same_funding",
                      description: `${owner.entityName || owner.address.slice(0, 10)} and ${otherSuspect.entityName || otherSuspect.address.slice(0, 10)} trace to the same funding source`,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return clusters;
}

function collectFundingSources(node: TraceNode, sources: Set<string>): void {
  if (node.transactions) {
    for (const tx of node.transactions) {
      sources.add(tx.from.toLowerCase());
    }
  }
  if (node.children) {
    for (const child of node.children) {
      collectFundingSources(child, sources);
    }
  }
}

// ===== PRE-MOVE VOLUME =====

export function computePreMoveVolume(
  dexTrades: DexTradeRow[],
  anomaly: AnomalyWindow,
  tokenAddress: string
): number {
  const tokenLower = tokenAddress.toLowerCase();
  let total = 0;

  for (const trade of dexTrades) {
    const isRelated =
      trade.token_bought.toLowerCase() === tokenLower ||
      trade.token_sold.toLowerCase() === tokenLower;
    if (!isRelated) continue;

    const tradeTs = Date.parse(trade.block_timestamp) / 1000;
    // Count volume in the 72h before anomaly
    if (tradeTs < anomaly.timestamp && anomaly.timestamp - tradeTs <= 72 * 3600) {
      total += trade.amount_usd;
    }
  }

  return total;
}

// ===== CLEAN REPORT (EARLY EXIT) =====

function buildCleanReport(
  caseId: string,
  tokenAddress: string,
  chain: string,
  phase0: Phase0Result,
  creditsUsed: number,
  startTime: number,
  phasesCompleted: (0 | 1 | 2 | 3)[]
): ForensicReport {
  return {
    caseId,
    mode: "token",
    subject: {
      address: tokenAddress,
      name: phase0.tokenInfo?.token_name || "Unknown",
      symbol: phase0.tokenInfo?.token_symbol || "???",
      chain,
      marketCapUsd: phase0.tokenInfo?.market_cap_usd,
      priceUsd: phase0.tokenInfo?.price_usd,
    },
    suspicionScore: 0,
    verdict: "CLEAN",
    anomaly: null,
    suspects: [],
    clusters: [],
    timeline: [],
    graph: { nodes: [], edges: [] },
    evidence: [],
    narrative: null,
    metadata: {
      creditsUsed,
      phasesCompleted,
      duration: Date.now() - startTime,
      createdAt: Math.floor(Date.now() / 1000),
      earlyExit: true,
      degradedSections: [],
    },
  };
}

// ===== PERSISTENCE =====

function saveReportToDb(report: ForensicReport): void {
  saveInvestigation({
    id: report.caseId,
    mode: report.mode,
    subjectId: report.subject.address,
    chain: report.subject.chain,
    suspicionScore: report.suspicionScore,
    verdict: report.verdict,
    reportJson: JSON.stringify(report),
  });
}

// ===== RETRY HELPER =====

async function retryOnce<T>(
  fn: () => Promise<NansenCliResponse<T>>
): Promise<NansenCliResponse<T>> {
  const first = await fn();
  if (first.success) return first;

  // Retry once with 2s delay
  await new Promise((r) => setTimeout(r, RETRY_DELAY));
  return fn();
}
