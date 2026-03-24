/**
 * One-time fixture capture script.
 *
 * Calls each Nansen endpoint once with real data and saves the raw JSON
 * response to test/fixtures/. These fixtures are then replayed in tests
 * so no further API credits are consumed.
 *
 * Usage:
 *   pnpm test:capture-fixtures
 *
 * Requirements:
 *   - NANSEN_API_KEY must be set in .env or environment
 *   - Will consume real Nansen credits (~300-400 on free plan)
 *   - Only needs to be run ONCE; fixtures are committed to git
 *
 * The script uses a known Ethereum address and token for consistent results.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);
const FIXTURES_DIR = path.join(process.cwd(), "test", "fixtures");
const NANSEN_BIN = path.join(process.cwd(), "node_modules", ".bin", "nansen");

// Known test subjects (pick stable, well-known addresses/tokens)
const TEST_WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // vitalik.eth
const TEST_TOKEN = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH
const TEST_CHAIN = "ethereum";

interface FixtureSpec {
  name: string;
  args: string[];
  estimatedCredits: number;
}

const FIXTURES: FixtureSpec[] = [
  // Profiler domain (free: search; 10cr each for others)
  {
    name: "profiler-search",
    args: ["profiler", "search", "--query", "vitalik"],
    estimatedCredits: 0,
  },
  {
    name: "profiler-pnl-summary",
    args: [
      "profiler",
      "pnl-summary",
      "--address",
      TEST_WALLET,
      "--chain",
      TEST_CHAIN,
    ],
    estimatedCredits: 10,
  },
  {
    name: "profiler-transactions",
    args: [
      "profiler",
      "transactions",
      "--address",
      TEST_WALLET,
      "--chain",
      TEST_CHAIN,
      "--days",
      "30",
    ],
    estimatedCredits: 10,
  },
  {
    name: "profiler-related-wallets",
    args: [
      "profiler",
      "related-wallets",
      "--address",
      TEST_WALLET,
      "--chain",
      TEST_CHAIN,
    ],
    estimatedCredits: 10,
  },
  {
    name: "profiler-perp-positions",
    args: ["profiler", "perp-positions", "--address", TEST_WALLET],
    estimatedCredits: 10,
  },

  // Token domain (10cr each)
  {
    name: "token-info",
    args: ["token", "info", "--token", TEST_TOKEN, "--chain", TEST_CHAIN],
    estimatedCredits: 10,
  },
  {
    name: "token-who-bought-sold",
    args: [
      "token",
      "who-bought-sold",
      "--token",
      TEST_TOKEN,
      "--chain",
      TEST_CHAIN,
    ],
    estimatedCredits: 10,
  },
  {
    name: "token-dex-trades",
    args: [
      "token",
      "dex-trades",
      "--token",
      TEST_TOKEN,
      "--chain",
      TEST_CHAIN,
      "--days",
      "30",
    ],
    estimatedCredits: 10,
  },
  {
    name: "token-flow-intelligence",
    args: [
      "token",
      "flow-intelligence",
      "--token",
      TEST_TOKEN,
      "--chain",
      TEST_CHAIN,
      "--days",
      "30",
    ],
    estimatedCredits: 10,
  },

  // Smart Money domain (50cr each)
  {
    name: "smart-money-dex-trades",
    args: ["smart-money", "dex-trades", "--chain", TEST_CHAIN],
    estimatedCredits: 50,
  },
  {
    name: "smart-money-netflow",
    args: ["smart-money", "netflow", "--chain", TEST_CHAIN],
    estimatedCredits: 50,
  },

  // Prediction Market domain (costs TBD, ~10-50cr each est.)
  {
    name: "pm-event-screener",
    args: ["prediction-market", "event-screener"],
    estimatedCredits: 50,
  },
  {
    name: "pm-market-screener",
    args: ["prediction-market", "market-screener"],
    estimatedCredits: 50,
  },
];

// Expensive fixtures — only capture if explicitly requested via --all flag
const EXPENSIVE_FIXTURES: FixtureSpec[] = [
  {
    name: "profiler-counterparties",
    args: [
      "profiler",
      "counterparties",
      "--address",
      TEST_WALLET,
      "--chain",
      TEST_CHAIN,
      "--days",
      "30",
    ],
    estimatedCredits: 50,
  },
  {
    name: "profiler-trace-d1",
    args: [
      "profiler",
      "trace",
      "--address",
      TEST_WALLET,
      "--chain",
      TEST_CHAIN,
      "--depth",
      "1",
      "--width",
      "3",
    ],
    estimatedCredits: 200,
  },
];

async function captureFixture(spec: FixtureSpec): Promise<void> {
  const outPath = path.join(FIXTURES_DIR, `${spec.name}.json`);

  // Skip if fixture already exists
  if (fs.existsSync(outPath)) {
    console.log(`  SKIP ${spec.name} (fixture exists)`);
    return;
  }

  try {
    console.log(
      `  CALL ${spec.name} (~${spec.estimatedCredits} credits)...`
    );
    const { stdout } = await execFileAsync(
      NANSEN_BIN,
      ["research", ...spec.args],
      {
        timeout: 30_000,
        env: {
          ...process.env,
          NANSEN_API_KEY: process.env.NANSEN_API_KEY,
        },
      }
    );

    // Validate it's JSON
    const parsed = JSON.parse(stdout);
    fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2));
    console.log(`  SAVED ${spec.name} → ${outPath}`);
  } catch (err: unknown) {
    const error = err as { stdout?: string; message?: string };
    // Save error response too — useful for testing error handling
    const errorData = {
      success: false,
      error: error.message || "Unknown error",
      code: "CAPTURE_ERROR",
    };

    // Try to parse stdout even on error (CLI returns JSON errors)
    if (error.stdout) {
      try {
        const parsed = JSON.parse(error.stdout);
        fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2));
        console.log(`  SAVED ${spec.name} (error response) → ${outPath}`);
        return;
      } catch {
        // fall through
      }
    }

    fs.writeFileSync(outPath, JSON.stringify(errorData, null, 2));
    console.log(`  ERROR ${spec.name}: ${error.message}`);
  }
}

async function main() {
  const includeExpensive = process.argv.includes("--all");

  console.log("Nansen Fixture Capture");
  console.log("======================");
  console.log(`Fixtures directory: ${FIXTURES_DIR}`);
  console.log();

  // Ensure fixtures directory exists
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  const specs = includeExpensive
    ? [...FIXTURES, ...EXPENSIVE_FIXTURES]
    : FIXTURES;

  const totalCredits = specs.reduce((sum, s) => sum + s.estimatedCredits, 0);
  console.log(
    `Capturing ${specs.length} fixtures (~${totalCredits} estimated credits)`
  );
  if (!includeExpensive) {
    console.log(
      "(Run with --all to include expensive fixtures like profiler trace)"
    );
  }
  console.log();

  // Run sequentially to respect rate limits and track progress
  for (const spec of specs) {
    await captureFixture(spec);
  }

  console.log();
  console.log("Done! Fixtures saved to test/fixtures/");
  console.log(
    "These fixtures should be committed to git for reproducible tests."
  );
}

main().catch(console.error);
