import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGetCached, mockSetCached } = vi.hoisted(() => ({
  mockGetCached: vi.fn().mockReturnValue(null),
  mockSetCached: vi.fn(),
}));

vi.mock("@/lib/cache/queries", () => ({
  getCachedApiResponse: mockGetCached,
  setCachedApiResponse: mockSetCached,
}));

// Don't mock child_process/util for this test - we're testing nansenApi, not nansenCli
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { nansenApi } from "@/lib/nansen/client";

describe("nansenApi REST fallback", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockFetch.mockReset();
    mockGetCached.mockReset().mockReturnValue(null);
    mockSetCached.mockReset();
    process.env = { ...originalEnv, NANSEN_API_KEY: "test-api-key" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("successful API call returns success with parsed JSON", async () => {
    const payload = { data: "test", value: 42 };
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 })
    );

    const result = await nansenApi("/test/endpoint", { foo: "bar" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(payload);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.nansen.ai/api/v1/test/endpoint",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          apiKey: "test-api-key",
        }),
        body: JSON.stringify({ foo: "bar" }),
      })
    );
  });

  it("cache hit returns cached without fetch", async () => {
    const cachedData = { success: true, data: { cached: true } };
    mockGetCached.mockReturnValue(cachedData);

    const result = await nansenApi("/test/endpoint", { foo: "bar" }, "my-cache-key");

    expect(result).toEqual(cachedData);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockGetCached).toHaveBeenCalledWith("my-cache-key");
  });

  it("missing NANSEN_API_KEY returns AUTH_FAILED", async () => {
    delete process.env.NANSEN_API_KEY;

    const result = await nansenApi("/test/endpoint", { foo: "bar" });

    expect(result.success).toBe(false);
    expect(result.code).toBe("AUTH_FAILED");
    expect(result.error).toContain("NANSEN_API_KEY");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("HTTP 401 returns AUTH_FAILED code", async () => {
    mockFetch.mockResolvedValue(
      new Response("Unauthorized", { status: 401 })
    );

    const result = await nansenApi("/test/endpoint", { foo: "bar" });

    expect(result.success).toBe(false);
    expect(result.code).toBe("AUTH_FAILED");
    expect(result.error).toContain("401");
  });

  it(
    "HTTP 429 with retry succeeds on 2nd attempt",
    async () => {
      const payload = { retried: true };
      mockFetch
        .mockResolvedValueOnce(new Response("Too Many Requests", { status: 429 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify(payload), { status: 200 })
        );

      const result = await nansenApi("/test/endpoint", { foo: "bar" });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(payload);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    },
    15_000
  );

  it("HTTP 503 returns UNAVAILABLE code", async () => {
    mockFetch.mockResolvedValue(
      new Response("Service Unavailable", { status: 503 })
    );

    const result = await nansenApi("/test/endpoint", { foo: "bar" });

    expect(result.success).toBe(false);
    expect(result.code).toBe("UNAVAILABLE");
    expect(result.error).toContain("503");
  });

  it(
    "network error returns FETCH_ERROR",
    async () => {
      mockFetch.mockRejectedValue(new Error("Network request failed"));

      const result = await nansenApi("/test/endpoint", { foo: "bar" });

      expect(result.success).toBe(false);
      expect(result.code).toBe("FETCH_ERROR");
      expect(result.error).toContain("Network request failed");
    },
    15_000
  );

  it("caches successful response when cacheKey provided", async () => {
    const payload = { data: "to-cache" };
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 })
    );

    const result = await nansenApi(
      "/test/endpoint",
      { foo: "bar" },
      "cache-key-123"
    );

    expect(result.success).toBe(true);
    expect(mockSetCached).toHaveBeenCalledWith("cache-key-123", {
      success: true,
      data: payload,
    });
  });
});

describe("unwrapCliResponse via nansenCli", () => {
  // To test unwrapCliResponse we need to import nansenCli with mocked child_process.
  // Since this module already has fetch mocked, we test the unwrap behavior
  // by verifying what nansenApi returns (nansenApi does NOT unwrap — it returns raw).
  // The unwrap is only in nansenCli. We test that separately by importing dynamically.

  it("nansenApi unwraps nested data arrays (same as CLI)", async () => {
    const nested = { pagination: { page: 1 }, data: [{ id: 1 }, { id: 2 }] };
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(nested), { status: 200 })
    );
    process.env.NANSEN_API_KEY = "test-api-key";

    const result = await nansenApi("/test/endpoint", {});

    // nansenApi now unwraps nested data arrays just like nansenCli
    expect(result.success).toBe(true);
    expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.pagination).toEqual({ page: 1 });
  });

  it("nansenApi returns non-array objects as-is", async () => {
    const flat = { name: "test", value: 42 };
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(flat), { status: 200 })
    );
    process.env.NANSEN_API_KEY = "test-api-key";

    const result = await nansenApi("/test/endpoint", {});

    expect(result.success).toBe(true);
    expect(result.data).toEqual(flat);
  });
});
