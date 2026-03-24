/**
 * Format a number in compact notation (e.g., $1.2M, $340K).
 */
export function formatCompactUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  return `${sign}$${abs.toFixed(4)}`;
}

/**
 * Format a number with commas and fixed decimals.
 */
export function formatUsd(value: number, decimals = 2): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Format a percentage value.
 */
export function formatPercent(value: number, decimals = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format a date as relative time ago (e.g., "2h ago", "3d ago").
 */
export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000) - timestamp;

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 604800)}w ago`;
}

/**
 * Format a unix timestamp as a short date string.
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a relative time offset (e.g., T-6h, T+1h) from an anchor timestamp.
 */
export function formatRelativeTime(
  eventTimestamp: number,
  anchorTimestamp: number
): string {
  const diffSeconds = eventTimestamp - anchorTimestamp;
  const diffHours = diffSeconds / 3600;

  if (Math.abs(diffHours) < 1) {
    const diffMinutes = Math.round(diffSeconds / 60);
    return diffMinutes >= 0 ? `T+${diffMinutes}m` : `T${diffMinutes}m`;
  }

  const rounded = Math.round(Math.abs(diffHours));
  return diffHours >= 0 ? `T+${rounded}h` : `T-${rounded}h`;
}
