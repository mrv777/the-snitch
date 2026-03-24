import { getDb } from "@/lib/cache/db";

const DEFAULT_DAILY_CAP = parseInt(process.env.DAILY_CREDIT_CAP || "2000", 10);

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export interface BudgetStatus {
  creditsUsed: number;
  remaining: number;
  dailyCap: number;
  canInvestigate: boolean;
}

export function getBudgetStatus(): BudgetStatus {
  const db = getDb();
  const date = todayKey();

  const row = db
    .prepare(`SELECT credits_used FROM budget_tracking WHERE date = ?`)
    .get(date) as { credits_used: number } | undefined;

  const creditsUsed = row?.credits_used ?? 0;
  const remaining = Math.max(0, DEFAULT_DAILY_CAP - creditsUsed);

  return {
    creditsUsed,
    remaining,
    dailyCap: DEFAULT_DAILY_CAP,
    canInvestigate: remaining > 0,
  };
}

export function recordCredits(amount: number): void {
  const db = getDb();
  const date = todayKey();

  db.prepare(
    `INSERT INTO budget_tracking (date, credits_used)
     VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET
       credits_used = credits_used + ?`
  ).run(date, amount, amount);
}

export function canAfford(estimatedCost: number): boolean {
  const { remaining } = getBudgetStatus();
  return remaining >= estimatedCost;
}
