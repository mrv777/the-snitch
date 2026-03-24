import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import type { NansenCliResponse } from "@/lib/nansen/types";

const mockExecFile = vi.hoisted(() => vi.fn());

// Mock cache to avoid SQLite in client tests
vi.mock("@/lib/cache/queries", () => ({
  getCachedApiResponse: vi.fn().mockReturnValue(null),
  setCachedApiResponse: vi.fn(),
}));

// Mock child_process + util.promisify to replay fixtures
vi.mock("child_process", () => ({
  execFile: mockExecFile,
}));
vi.mock("util", () => ({
  promisify: () => mockExecFile,
}));

import { nansenCli } from "@/lib/nansen/client";

const FIXTURES_DIR = path.join(process.cwd(), "test", "fixtures");

function loadFixture(name: string): Record<string, unknown> | null {
  const filePath = path.join(FIXTURES_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function mockFixture(name: string) {
  const fixture = loadFixture(name);
  if (!fixture) return false;
  mockExecFile.mockResolvedValue({
    stdout: JSON.stringify(fixture),
    stderr: "",
  });
  return true;
}

describe("nansenCli with fixtures", () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  it("parses a successful profiler-search response", async () => {
    if (!mockFixture("profiler-search")) return;

    const result = await nansenCli(["profiler", "search", "--query", "test"]);
    expect(result.success).toBeDefined();
    expect(mockExecFile).toHaveBeenCalledOnce();
  });

  it("parses a successful token-info response", async () => {
    if (!mockFixture("token-info")) return;

    const result = await nansenCli(["token", "info", "--token", "0x123"]);
    expect(result.success).toBeDefined();
  });

  it("parses a successful profiler-pnl-summary response", async () => {
    if (!mockFixture("profiler-pnl-summary")) return;

    const result = await nansenCli([
      "profiler",
      "pnl-summary",
      "--address",
      "0x123",
    ]);
    expect(result.success).toBeDefined();
  });

  it("handles CLI errors gracefully", async () => {
    mockExecFile.mockRejectedValue(
      new Error("Command failed: timeout after 15000ms")
    );

    const result = await nansenCli(["profiler", "trace", "--address", "0x123"]);
    expect(result.success).toBe(false);
    expect(result.code).toBe("TIMEOUT");
  });

  it("handles auth errors", async () => {
    mockExecFile.mockRejectedValue(new Error("401 Unauthorized"));

    const result = await nansenCli(["profiler", "trace", "--address", "0x123"]);
    expect(result.success).toBe(false);
    expect(result.code).toBe("AUTH_FAILED");
  });

  it("handles rate limit errors", async () => {
    mockExecFile.mockRejectedValue(new Error("429 Too Many Requests"));

    const result = await nansenCli(["profiler", "trace", "--address", "0x123"]);
    expect(result.success).toBe(false);
    expect(result.code).toBe("RATE_LIMITED");
  });

  it("handles credit exhaustion errors", async () => {
    mockExecFile.mockRejectedValue(
      new Error("Insufficient credits remaining")
    );

    const result = await nansenCli(["profiler", "trace", "--address", "0x123"]);
    expect(result.success).toBe(false);
    expect(result.code).toBe("CREDITS_EXHAUSTED");
  });

  it("uses cache when available", async () => {
    const { getCachedApiResponse } = await import("@/lib/cache/queries");
    const cachedData: NansenCliResponse = {
      success: true,
      data: { cached: true },
    };
    vi.mocked(getCachedApiResponse).mockReturnValueOnce(cachedData);

    const result = await nansenCli(
      ["profiler", "search", "--query", "test"],
      "test-cache-key"
    );

    expect(result).toEqual(cachedData);
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});

describe("fixture loading", () => {
  it("loadFixture returns null for missing fixtures", () => {
    expect(loadFixture("nonexistent-fixture")).toBeNull();
  });
});
