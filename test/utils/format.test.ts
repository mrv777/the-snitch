import { describe, it, expect } from "vitest";
import {
  formatCompactUsd,
  formatUsd,
  formatPercent,
  formatTimeAgo,
  formatRelativeTime,
} from "@/lib/utils/format";

describe("formatCompactUsd", () => {
  it("formats billions", () => {
    expect(formatCompactUsd(1_500_000_000)).toBe("$1.5B");
  });

  it("formats millions", () => {
    expect(formatCompactUsd(2_400_000)).toBe("$2.4M");
  });

  it("formats thousands", () => {
    expect(formatCompactUsd(340_000)).toBe("$340.0K");
  });

  it("formats small values", () => {
    expect(formatCompactUsd(42.5)).toBe("$42.50");
  });

  it("formats sub-dollar values", () => {
    expect(formatCompactUsd(0.0034)).toBe("$0.0034");
  });

  it("handles negatives", () => {
    expect(formatCompactUsd(-1_200_000)).toBe("-$1.2M");
  });

  it("handles zero", () => {
    expect(formatCompactUsd(0)).toBe("$0.0000");
  });
});

describe("formatUsd", () => {
  it("formats with commas", () => {
    expect(formatUsd(1234567.89)).toBe("$1,234,567.89");
  });

  it("handles negatives", () => {
    expect(formatUsd(-500)).toBe("-$500.00");
  });
});

describe("formatPercent", () => {
  it("formats positive with plus sign", () => {
    expect(formatPercent(42.567)).toBe("+42.6%");
  });

  it("formats negative without plus sign", () => {
    expect(formatPercent(-15.3)).toBe("-15.3%");
  });

  it("formats zero", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });
});

describe("formatTimeAgo", () => {
  it("formats seconds as just now", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatTimeAgo(now - 30)).toBe("just now");
  });

  it("formats minutes", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatTimeAgo(now - 300)).toBe("5m ago");
  });

  it("formats hours", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatTimeAgo(now - 7200)).toBe("2h ago");
  });

  it("formats days", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatTimeAgo(now - 259200)).toBe("3d ago");
  });
});

describe("formatRelativeTime", () => {
  const anchor = 1000000;

  it("formats hours before anchor", () => {
    expect(formatRelativeTime(anchor - 21600, anchor)).toBe("T-6h");
  });

  it("formats hours after anchor", () => {
    expect(formatRelativeTime(anchor + 3600, anchor)).toBe("T+1h");
  });

  it("formats minutes for sub-hour differences", () => {
    expect(formatRelativeTime(anchor + 1800, anchor)).toBe("T+30m");
  });

  it("formats minutes before anchor", () => {
    expect(formatRelativeTime(anchor - 600, anchor)).toBe("T-10m");
  });
});
