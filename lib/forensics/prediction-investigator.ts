import { randomBytes } from "crypto";
import type {
  ForensicReport,
  Suspect,
  SuspectCluster,
  SSEEvent,
  PredictionInvestigationOptions,
} from "./types";
import { scoreToVerdict } from "./types";
import { computeInsiderScore } from "./insider-scorer";
import { buildPmTimeline } from "./pm-timeline-builder";
import { recordCredits, canAfford } from "@/lib/budget/tracker";
import { saveInvestigation } from "@/lib/cache/queries";
import { generateNarrative } from "./narrative-generator";

// Nansen endpoints
import {
  pmEventScreener,
  pmPnlByMarket,
  pmTopHolders,
  pmTradesByAddress,
} from "@/lib/nansen/endpoints/prediction";
import {
  profilerPnlSummary,
  profilerTransactions,
  profilerRelatedWallets,
} from "@/lib/nansen/endpoints/profiler";

import type {
  NansenCliResponse,
  PmEventScreenerRow,
  PmPnlByMarketRow,
  PmTopHolderRow,
  PmTradeRow,
  PnlSummaryResponse,
  RelatedWalletRow,
  TransactionRow,
} from "@/lib/nansen/types";

// --- Constants ---

const OVERALL_TIMEOUT = 60_000;
const RETRY_DELAY = 2_000;
const ESTIMATED_FULL_COST = 400; // credits for a full PM investigation
const PHASE_1_COST = 100; // ~2 calls × ~50 credits est.
const PHASE_2_BASE_COST = 40; // per profiter: 4 calls × ~10 credits each

// --- Case ID Generator ---

function generateCaseId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const hex = randomBytes(2).toString("hex");
  return `case-${date}-${hex}`;
}

// --- Main Investigator ---

export async function investigatePrediction(
  options: PredictionInvestigationOptions
): Promise<ForensicReport> {
  const { eventId, marketId, onProgress } = options;
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OVERALL_TIMEOUT);

  try {
    // ===== PHASE 0: EVENT DISCOVERY =====
    emit({
      type: "phase_start",
      data: { phase: 0, step: "Discovering event details...", complete: false },
    });

    const phase0 = await runPhase0(eventId);
    creditsUsed += 50; // ~1 call for event-screener
    recordCredits(50);
    phasesCompleted.push(0);

    // Resolve the target event
    const targetEvent = phase0.events.find((e) => e.event_id === eventId);

    if (!targetEvent) {
      // Event not found — return early with minimal report
      const emptyReport = buildEmptyReport(
        caseId,
        eventId,
        creditsUsed,
        startTime,
        phasesCompleted,
        "Event not found in screener results"
      );
      saveReportToDb(emptyReport, eventId);
      emit({ type: "report_complete", data: emptyReport });
      return emptyReport;
    }

    // Determine which market ID to investigate
    const resolvedMarketId =
      marketId ||
      targetEvent.markets?.[0]?.market_id ||
      eventId;

    emit({
      type: "phase_complete",
      data: { phase: 0, step: "Event identified", complete: true },
    });

    // ===== PHASE 1: PROFIT ANALYSIS =====
    emit({
      type: "phase_start",
      data: { phase: 1, step: "Analyzing market profits...", complete: false },
    });

    const phase1 = await runPhase1(resolvedMarketId);
    creditsUsed += PHASE_1_COST;
    recordCredits(PHASE_1_COST);
    phasesCompleted.push(1);

    // Rank top profiters
    const profiters = rankProfiters(phase1.pnlByMarket, phase1.topHolders);

    emit({
      type: "suspects_found",
      data: { suspects: profiters } as unknown as Partial<ForensicReport>,
    });

    emit({
      type: "phase_complete",
      data: { phase: 1, step: "Profiters identified", complete: true },
    });

    // If no profiters found, short-circuit
    if (profiters.length === 0) {
      const cleanReport = buildCleanPmReport(
        caseId,
        targetEvent,
        resolvedMarketId,
        creditsUsed,
        startTime,
        phasesCompleted
      );
      saveReportToDb(cleanReport, eventId);
      emit({ type: "report_complete", data: cleanReport });
      return cleanReport;
    }

    // ===== PHASE 2: WALLET TRACING =====
    emit({
      type: "phase_start",
      data: { phase: 2, step: "Tracing profiter wallets...", complete: false },
    });

    // Resolution timestamp for timeline
    const resolutionTimestamp = targetEvent.resolution_date
      ? Math.floor(Date.parse(targetEvent.resolution_date) / 1000)
      : Math.floor(Date.now() / 1000);

    const phase2 = await runPhase2(
      profiters.slice(0, 2), // top 2 profiters only
      degradedSections
    );
    creditsUsed += phase2.creditsUsed;
    recordCredits(phase2.creditsUsed);
    phasesCompleted.push(2);

    emit({
      type: "phase_complete",
      data: { phase: 2, step: "Wallet tracing complete", complete: true },
    });

    // Enrich profiters with PnL and timing data
    enrichProfiters(profiters, phase2, resolutionTimestamp);

    // Build clusters from related wallets
    const clusters = buildPmClusters(profiters, phase2.relatedWallets);

    // ===== PHASE 3: ANALYSIS + REPORT =====
    emit({
      type: "phase_start",
      data: { phase: 3, step: "Computing insider score...", complete: false },
    });

    // Compute total market PnL for concentration metric
    const totalMarketPnl = phase1.pnlByMarket
      .filter((r) => r.realized_pnl_usd > 0)
      .reduce((sum, r) => sum + r.realized_pnl_usd, 0);

    // Insider score
    const { score, evidence } = computeInsiderScore({
      profiters,
      clusters,
      totalMarketPnl,
      pnlByMarket: phase1.pnlByMarket,
      hasConnectionData: phase2.relatedWallets.size > 0,
      resolutionTimestamp,
    });

    const verdict = scoreToVerdict(score);

    emit({
      type: "score_computed",
      data: { suspicionScore: score, verdict } as unknown as Partial<ForensicReport>,
    });

    // Timeline
    const timeline = buildPmTimeline({
      profiters,
      trades: phase2.trades,
      resolutionTimestamp,
      eventTitle: targetEvent.title,
      outcome: targetEvent.outcome || "Unknown",
    });

    emit({
      type: "step_update",
      data: { phase: 3, step: "Generating intelligence report...", complete: false },
    });

    // Assemble partial report for narrative generation
    const partialReport: ForensicReport = {
      caseId,
      mode: "prediction",
      subject: {
        address: resolvedMarketId,
        name: targetEvent.title,
        symbol: targetEvent.outcome || "N/A",
        chain: "polygon", // Polymarket runs on Polygon
        eventTitle: targetEvent.title,
        outcome: targetEvent.outcome,
        resolutionDate: targetEvent.resolution_date,
        marketId: resolvedMarketId,
      },
      suspicionScore: score,
      verdict,
      anomaly: null, // PM mode doesn't use anomaly detection
      suspects: profiters,
      clusters,
      timeline,
      graph: { nodes: [], edges: [] }, // No wallet graph in PM mode (save credits)
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
      console.error("PM narrative generation failed:", err);
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

    saveReportToDb(report, eventId);

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
  events: PmEventScreenerRow[];
}

async function runPhase0(eventId: string): Promise<Phase0Result> {
  const eventsRes = await pmEventScreener();

  return {
    events: eventsRes.success && Array.isArray(eventsRes.data) ? eventsRes.data : [],
  };
}

interface Phase1Result {
  pnlByMarket: PmPnlByMarketRow[];
  topHolders: PmTopHolderRow[];
}

async function runPhase1(marketId: string): Promise<Phase1Result> {
  const [pnlRes, holdersRes] = await Promise.all([
    pmPnlByMarket(marketId),
    pmTopHolders(marketId),
  ]);

  return {
    pnlByMarket: pnlRes.success && Array.isArray(pnlRes.data) ? pnlRes.data : [],
    topHolders: holdersRes.success && Array.isArray(holdersRes.data) ? holdersRes.data : [],
  };
}

interface Phase2Result {
  trades: Map<string, PmTradeRow[]>;
  pnlSummaries: Map<string, PnlSummaryResponse>;
  transactions: Map<string, TransactionRow[]>;
  relatedWallets: Map<string, RelatedWalletRow[]>;
  creditsUsed: number;
}

async function runPhase2(
  profiters: Suspect[],
  degradedSections: string[]
): Promise<Phase2Result> {
  let creditsUsed = 0;
  const trades = new Map<string, PmTradeRow[]>();
  const pnlSummaries = new Map<string, PnlSummaryResponse>();
  const transactions = new Map<string, TransactionRow[]>();
  const relatedWallets = new Map<string, RelatedWalletRow[]>();

  if (profiters.length === 0) {
    return { trades, pnlSummaries, transactions, relatedWallets, creditsUsed };
  }

  const calls: Promise<void>[] = [];

  for (const profiter of profiters) {
    const addr = profiter.address;

    // trades-by-address
    calls.push(
      retryOnce(() => pmTradesByAddress(addr)).then((res) => {
        if (res.success) {
          trades.set(addr.toLowerCase(), res.data);
        }
        creditsUsed += 50; // est. PM endpoint cost
      })
    );

    // profiler pnl-summary (Ethereum — Polymarket is on Polygon, but profiler may need ethereum)
    calls.push(
      retryOnce(() => profilerPnlSummary(addr, "ethereum")).then((res) => {
        if (res.success) {
          pnlSummaries.set(addr.toLowerCase(), res.data);
        }
        creditsUsed += 10;
      })
    );

    // profiler transactions
    calls.push(
      retryOnce(() => profilerTransactions(addr, "ethereum")).then((res) => {
        if (res.success) {
          transactions.set(addr.toLowerCase(), res.data);
        }
        creditsUsed += 10;
      })
    );

    // profiler related-wallets
    calls.push(
      retryOnce(() => profilerRelatedWallets(addr, "ethereum")).then((res) => {
        if (res.success) {
          relatedWallets.set(addr.toLowerCase(), res.data);
        }
        creditsUsed += 10;
      })
    );
  }

  await Promise.all(calls);

  return { trades, pnlSummaries, transactions, relatedWallets, creditsUsed };
}

// ===== PROFITER RANKING =====

export function rankProfiters(
  pnlByMarket: PmPnlByMarketRow[],
  topHolders: PmTopHolderRow[]
): Suspect[] {
  const scoreMap = new Map<
    string,
    {
      address: string;
      entityName?: string;
      pnlUsd: number;
      positionSizeUsd: number;
      side?: string;
      outcome?: string;
    }
  >();

  // Merge from pnl-by-market (primary source)
  for (const row of pnlByMarket) {
    const addr = row.address.toLowerCase();
    if (row.realized_pnl_usd <= 0) continue; // only profitable addresses

    const existing = scoreMap.get(addr);
    scoreMap.set(addr, {
      address: addr,
      entityName: row.entity_name || existing?.entityName,
      pnlUsd: row.realized_pnl_usd,
      positionSizeUsd: row.position_size_usd ?? existing?.positionSizeUsd ?? 0,
      outcome: row.outcome || existing?.outcome,
    });
  }

  // Enrich from top-holders
  for (const holder of topHolders) {
    const addr = holder.address.toLowerCase();
    const existing = scoreMap.get(addr);
    if (existing) {
      existing.entityName = existing.entityName || holder.entity_name;
      existing.positionSizeUsd = Math.max(
        existing.positionSizeUsd,
        holder.position_size_usd
      );
    }
  }

  // Sort by PnL descending, take top 3
  const ranked = Array.from(scoreMap.values())
    .sort((a, b) => b.pnlUsd - a.pnlUsd)
    .slice(0, 3);

  return ranked.map((entry, i) => ({
    address: entry.address,
    entityName: entry.entityName,
    rank: i + 1,
    score: entry.pnlUsd, // use PnL as ranking score
    timingAdvantage: 0, // enriched in Phase 2
    volumeUsd: entry.positionSizeUsd,
    action: "buy" as const, // PM profiters are position-takers
    isDexVisible: false, // PM positions aren't DEX trades
    pnlUsd: entry.pnlUsd,
  }));
}

// ===== PROFITER ENRICHMENT =====

export function enrichProfiters(
  profiters: Suspect[],
  phase2: Phase2Result,
  resolutionTimestamp: number
): void {
  for (const profiter of profiters) {
    const addr = profiter.address.toLowerCase();

    // PnL data from profiler
    const pnl = phase2.pnlSummaries.get(addr);
    if (pnl) {
      profiter.pnlPercent = pnl.realized_pnl_percent;
      profiter.winRate = pnl.win_rate;
    }

    // Compute timing advantage from PM trades
    const profiterTrades = phase2.trades.get(addr);
    if (profiterTrades && profiterTrades.length > 0) {
      // Find earliest trade before resolution
      let earliestBeforeResolution = Infinity;
      for (const trade of profiterTrades) {
        const ts = Date.parse(trade.block_timestamp) / 1000;
        if (ts < resolutionTimestamp && ts < earliestBeforeResolution) {
          earliestBeforeResolution = ts;
        }
      }

      if (earliestBeforeResolution < Infinity) {
        profiter.timingAdvantage =
          (resolutionTimestamp - earliestBeforeResolution) / 3600; // hours
      }
    }
  }
}

// ===== CLUSTER BUILDING =====

export function buildPmClusters(
  profiters: Suspect[],
  relatedWallets: Map<string, RelatedWalletRow[]>
): SuspectCluster[] {
  const clusters: SuspectCluster[] = [];
  if (profiters.length < 2) return clusters;

  const profiterAddrs = new Set(profiters.map((p) => p.address.toLowerCase()));

  // Check related wallets for overlap between profiters
  for (const [ownerAddr, related] of relatedWallets) {
    for (const rel of related) {
      if (
        profiterAddrs.has(rel.address.toLowerCase()) &&
        ownerAddr !== rel.address.toLowerCase()
      ) {
        const owner = profiters.find(
          (p) => p.address.toLowerCase() === ownerAddr
        );
        const relProfiter = profiters.find(
          (p) => p.address.toLowerCase() === rel.address.toLowerCase()
        );
        if (owner && relProfiter) {
          const alreadyClustered = clusters.some(
            (c) =>
              c.suspects.includes(owner) && c.suspects.includes(relProfiter)
          );
          if (!alreadyClustered) {
            clusters.push({
              suspects: [owner, relProfiter],
              connectionType: "related_wallets",
              description: `${owner.entityName || owner.address.slice(0, 10)} and ${relProfiter.entityName || relProfiter.address.slice(0, 10)} flagged as related wallets`,
            });
          }
        }
      }
    }
  }

  return clusters;
}

// ===== EMPTY/CLEAN REPORTS =====

function buildEmptyReport(
  caseId: string,
  eventId: string,
  creditsUsed: number,
  startTime: number,
  phasesCompleted: (0 | 1 | 2 | 3)[],
  reason: string
): ForensicReport {
  return {
    caseId,
    mode: "prediction",
    subject: {
      address: eventId,
      name: "Unknown Event",
      symbol: "N/A",
      chain: "polygon",
      eventTitle: reason,
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
      degradedSections: [reason],
    },
  };
}

function buildCleanPmReport(
  caseId: string,
  event: PmEventScreenerRow,
  marketId: string,
  creditsUsed: number,
  startTime: number,
  phasesCompleted: (0 | 1 | 2 | 3)[]
): ForensicReport {
  return {
    caseId,
    mode: "prediction",
    subject: {
      address: marketId,
      name: event.title,
      symbol: event.outcome || "N/A",
      chain: "polygon",
      eventTitle: event.title,
      outcome: event.outcome,
      resolutionDate: event.resolution_date,
      marketId,
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
      degradedSections: ["no_profiters"],
    },
  };
}

// ===== PERSISTENCE =====

/**
 * Save report to DB. For prediction mode, subjectId should be the original
 * eventId (the URL slug) so that cache lookups by eventId always hit.
 * The resolved marketId is preserved in report.subject.marketId within the JSON.
 */
function saveReportToDb(report: ForensicReport, subjectIdOverride?: string): void {
  saveInvestigation({
    id: report.caseId,
    mode: report.mode,
    subjectId: subjectIdOverride ?? report.subject.address,
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

  await new Promise((r) => setTimeout(r, RETRY_DELAY));
  return fn();
}
