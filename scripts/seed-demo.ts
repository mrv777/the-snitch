/**
 * Demo seed script — runs real investigations and monitor polls to populate
 * the SQLite database with showcase data for demos and presentations.
 *
 * Usage:
 *   npx tsx scripts/seed-demo.ts                    # token investigations only
 *   npx tsx scripts/seed-demo.ts --monitor          # also run 2 monitor poll cycles
 *   npx tsx scripts/seed-demo.ts --prediction       # also run PM investigations
 *   npx tsx scripts/seed-demo.ts --all              # everything
 *   npx tsx scripts/seed-demo.ts --dry-run          # show what would run, no API calls
 *
 * Requirements:
 *   - NANSEN_API_KEY and GEMINI_API_KEY must be set in .env or environment
 *   - Consumes real Nansen credits (~600 per token, ~400 per PM, ~150 per poll)
 *   - Run on dev server: `pnpm dev` must be running (for Playwright card rendering)
 *
 * Edit the TOKEN_TARGETS and PM_TARGETS arrays below with tokens/events you want
 * to showcase. Research recent notable pumps/dumps/rugs before running.
 */

import { investigateToken } from "../lib/forensics/token-investigator";
import { investigatePrediction } from "../lib/forensics/prediction-investigator";
import { pollOnce } from "../lib/monitor/watcher";
import { getBudgetStatus } from "../lib/budget/tracker";
import { getRecentInvestigations } from "../lib/cache/queries";
import type { SSEEvent } from "../lib/forensics/types";

// ============================================================================
// CONFIGURE DEMO TARGETS HERE
// Research tokens with known suspicious activity before running
// ============================================================================

interface TokenTarget {
  address: string;
  chain: string;
  name: string; // human-readable label for console output
}

interface PmTarget {
  eventId: string;
  marketId?: string;
  name: string;
}

const TOKEN_TARGETS: TokenTarget[] = [
  // TODO: Replace with researched tokens that have notable price movements
  // Look for recent pumps/dumps/rugs on Ethereum, Base, or Solana
  //
  // Examples (verify these are still relevant before running):
  // {
  //   address: "0x...",
  //   chain: "ethereum",
  //   name: "Example memecoin pump",
  // },
  // {
  //   address: "0x...",
  //   chain: "base",
  //   name: "Base token with suspicious activity",
  // },
];

const PM_TARGETS: PmTarget[] = [
  // TODO: Replace with real Polymarket event IDs
  // Use the event-screener to find recently resolved events
  //
  // Examples:
  // {
  //   eventId: "...",
  //   marketId: "...",
  //   name: "Example prediction market event",
  // },
];

// Number of monitor poll cycles to run for seeding
const MONITOR_POLL_CYCLES = 2;

// ============================================================================
// Script logic
// ============================================================================

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const INCLUDE_MONITOR = args.includes("--monitor") || args.includes("--all");
const INCLUDE_PM = args.includes("--prediction") || args.includes("--all");

function logProgress(event: SSEEvent) {
  if (event.type === "phase_start" || event.type === "step_update") {
    const data = event.data as { step?: string; phase?: number };
    process.stdout.write(
      `    Phase ${data.phase ?? "?"}: ${data.step ?? ""}\r`
    );
  }
}

async function seedTokenInvestigations() {
  if (TOKEN_TARGETS.length === 0) {
    console.log("\n  No token targets configured. Edit TOKEN_TARGETS in this script.");
    return;
  }

  console.log(`\n  Running ${TOKEN_TARGETS.length} token investigations...`);

  for (const target of TOKEN_TARGETS) {
    const budget = getBudgetStatus();
    if (budget.remaining < 600) {
      console.log(`\n  STOP: Budget too low (${budget.remaining} remaining). Skipping remaining tokens.`);
      break;
    }

    console.log(`\n  [TOKEN] ${target.name}`);
    console.log(`    Address: ${target.address}`);
    console.log(`    Chain:   ${target.chain}`);
    console.log(`    Budget:  ${budget.remaining} credits remaining`);

    if (DRY_RUN) {
      console.log("    (dry run — skipping)");
      continue;
    }

    try {
      const report = await investigateToken({
        tokenAddress: target.address,
        chain: target.chain,
        onProgress: logProgress,
      });
      console.log(`\n    Result: ${report.verdict} (score: ${report.suspicionScore})`);
      console.log(`    Case:   ${report.caseId}`);
      console.log(`    Credits: ${report.metadata.creditsUsed}`);
    } catch (err) {
      console.error(`\n    ERROR: ${err instanceof Error ? err.message : err}`);
    }
  }
}

async function seedPmInvestigations() {
  if (PM_TARGETS.length === 0) {
    console.log("\n  No PM targets configured. Edit PM_TARGETS in this script.");
    return;
  }

  console.log(`\n  Running ${PM_TARGETS.length} prediction market investigations...`);

  for (const target of PM_TARGETS) {
    const budget = getBudgetStatus();
    if (budget.remaining < 400) {
      console.log(`\n  STOP: Budget too low (${budget.remaining} remaining). Skipping remaining PM targets.`);
      break;
    }

    console.log(`\n  [PM] ${target.name}`);
    console.log(`    Event ID: ${target.eventId}`);
    console.log(`    Budget:   ${budget.remaining} credits remaining`);

    if (DRY_RUN) {
      console.log("    (dry run — skipping)");
      continue;
    }

    try {
      const report = await investigatePrediction({
        eventId: target.eventId,
        marketId: target.marketId,
        onProgress: logProgress,
      });
      console.log(`\n    Result: ${report.verdict} (score: ${report.suspicionScore})`);
      console.log(`    Case:   ${report.caseId}`);
      console.log(`    Credits: ${report.metadata.creditsUsed}`);
    } catch (err) {
      console.error(`\n    ERROR: ${err instanceof Error ? err.message : err}`);
    }
  }
}

async function seedMonitorEvents() {
  console.log(`\n  Running ${MONITOR_POLL_CYCLES} monitor poll cycles...`);

  for (let i = 1; i <= MONITOR_POLL_CYCLES; i++) {
    const budget = getBudgetStatus();
    if (budget.remaining < 150) {
      console.log(`\n  STOP: Budget too low (${budget.remaining} remaining). Skipping remaining polls.`);
      break;
    }

    console.log(`\n  [POLL ${i}/${MONITOR_POLL_CYCLES}]`);
    console.log(`    Budget: ${budget.remaining} credits remaining`);

    if (DRY_RUN) {
      console.log("    (dry run — skipping)");
      continue;
    }

    try {
      const result = await pollOnce();
      console.log(`    Events: ${result.events.length} flagged`);
      console.log(`    Credits: ${result.creditsUsed}`);
      if (result.errors.length > 0) {
        console.log(`    Errors: ${result.errors.join(", ")}`);
      }
    } catch (err) {
      console.error(`    ERROR: ${err instanceof Error ? err.message : err}`);
    }

    // Brief pause between polls
    if (i < MONITOR_POLL_CYCLES) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main() {
  console.log("The Snitch — Demo Data Seeder");
  console.log("==============================");
  if (DRY_RUN) console.log("(DRY RUN — no API calls will be made)");

  const budget = getBudgetStatus();
  console.log(`\nBudget: ${budget.creditsUsed}/${budget.dailyCap} used today (${budget.remaining} remaining)`);

  // Estimate total cost
  const tokenCost = TOKEN_TARGETS.length * 600;
  const pmCost = INCLUDE_PM ? PM_TARGETS.length * 400 : 0;
  const monitorCost = INCLUDE_MONITOR ? MONITOR_POLL_CYCLES * 150 : 0;
  const totalEstimate = tokenCost + pmCost + monitorCost;
  console.log(`Estimated cost: ~${totalEstimate} credits`);

  if (totalEstimate > budget.remaining && !DRY_RUN) {
    console.log(`\nWARNING: Estimated cost exceeds remaining budget. Some investigations may be skipped.`);
  }

  // Token investigations (always run)
  await seedTokenInvestigations();

  // PM investigations (if requested)
  if (INCLUDE_PM) {
    await seedPmInvestigations();
  }

  // Monitor polls (if requested)
  if (INCLUDE_MONITOR) {
    await seedMonitorEvents();
  }

  // Summary
  console.log("\n==============================");
  console.log("Summary:");

  const finalBudget = getBudgetStatus();
  console.log(`  Credits used this session: ~${finalBudget.creditsUsed - budget.creditsUsed}`);
  console.log(`  Budget remaining: ${finalBudget.remaining}`);

  if (!DRY_RUN) {
    const recent = getRecentInvestigations(10);
    console.log(`  Cached investigations: ${recent.length}`);
    for (const inv of recent) {
      console.log(`    - ${inv.id} (${inv.mode}) ${inv.verdict ?? "N/A"} score:${inv.suspicion_score ?? "?"}`);
    }
  }

  console.log("\nDone! Cached results will be served to users without spending credits.");
}

main().catch(console.error);
