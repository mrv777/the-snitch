import { getDb } from "@/lib/cache/db";

const DAILY_LIMIT = 5;
const POLL_DAILY_LIMIT = 10;
const WINDOW_SECONDS = 86400; // 24 hours

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number; // seconds until reset
}

/**
 * Generic rate limit check against a key (ip or prefixed ip).
 */
function checkRateLimitForKey(key: string, limit: number): RateLimitResult {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - WINDOW_SECONDS;

  // Clean old entries
  db.prepare(`DELETE FROM rate_limits WHERE timestamp < ?`).run(windowStart);

  // Count recent requests
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM rate_limits
       WHERE ip = ? AND timestamp >= ?`
    )
    .get(key, windowStart) as { count: number };

  const count = row.count;

  if (count >= limit) {
    // Find oldest entry to compute reset time
    const oldest = db
      .prepare(
        `SELECT MIN(timestamp) as ts FROM rate_limits
         WHERE ip = ? AND timestamp >= ?`
      )
      .get(key, windowStart) as { ts: number };

    return {
      allowed: false,
      remaining: 0,
      resetIn: WINDOW_SECONDS - (now - oldest.ts),
    };
  }

  return {
    allowed: true,
    remaining: limit - count,
    resetIn: WINDOW_SECONDS,
  };
}

/**
 * Check if an IP can perform another investigation.
 * 5 investigations/day per IP. Viewing cached reports is unlimited.
 */
export function checkRateLimit(ip: string): RateLimitResult {
  return checkRateLimitForKey(ip, DAILY_LIMIT);
}

/**
 * Check if an IP can trigger another monitor poll.
 * 10 polls/day per IP to prevent credit exhaustion.
 */
export function checkPollRateLimit(ip: string): RateLimitResult {
  return checkRateLimitForKey(`poll:${ip}`, POLL_DAILY_LIMIT);
}

/**
 * Record an investigation for rate limiting.
 * Call this AFTER an investigation starts, not before.
 */
export function recordInvestigation(ip: string): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`INSERT INTO rate_limits (ip, timestamp) VALUES (?, ?)`).run(
    ip,
    now
  );
}

/**
 * Record a monitor poll for rate limiting.
 */
export function recordPoll(ip: string): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`INSERT INTO rate_limits (ip, timestamp) VALUES (?, ?)`).run(
    `poll:${ip}`,
    now
  );
}

/**
 * Extract client IP from request headers.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}
