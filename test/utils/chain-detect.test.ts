import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { detectEvmChain } from "@/lib/utils/chain-detect";

function rpcResponse(hexBalance: string) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: 1, result: hexBalance }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function rpcError() {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "err" } }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("detectEvmChain", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ethereum when only ETH has balance", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("ethereum")) return Promise.resolve(rpcResponse("0xde0b6b3a7640000")); // 1 ETH
      return Promise.resolve(rpcResponse("0x0")); // 0 on Base
    });

    const chain = await detectEvmChain("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
    expect(chain).toBe("ethereum");
  });

  it("returns base when only Base has balance", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("base")) return Promise.resolve(rpcResponse("0xde0b6b3a7640000"));
      return Promise.resolve(rpcResponse("0x0"));
    });

    const chain = await detectEvmChain("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
    expect(chain).toBe("base");
  });

  it("returns chain with higher balance when both have funds", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("ethereum")) return Promise.resolve(rpcResponse("0x1")); // small
      return Promise.resolve(rpcResponse("0xde0b6b3a7640000")); // large on Base
    });

    const chain = await detectEvmChain("0xABC");
    expect(chain).toBe("base");
  });

  it("returns ethereum when both have equal balance", async () => {
    mockFetch.mockResolvedValue(rpcResponse("0xde0b6b3a7640000"));

    const chain = await detectEvmChain("0xABC");
    // When equal, ethBalance > baseBalance is false and baseBalance > ethBalance is false,
    // so it falls through to default
    expect(chain).toBe("ethereum");
  });

  it("defaults to ethereum when neither has balance", async () => {
    mockFetch.mockResolvedValue(rpcResponse("0x0"));

    const chain = await detectEvmChain("0xABC");
    expect(chain).toBe("ethereum");
  });

  it("defaults to ethereum on RPC error", async () => {
    mockFetch.mockResolvedValue(rpcError());

    const chain = await detectEvmChain("0xABC");
    expect(chain).toBe("ethereum");
  });

  it("defaults to ethereum on network failure", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));

    const chain = await detectEvmChain("0xABC");
    expect(chain).toBe("ethereum");
  });

  it("defaults to ethereum on HTTP error", async () => {
    mockFetch.mockResolvedValue(new Response("", { status: 500 }));

    const chain = await detectEvmChain("0xABC");
    expect(chain).toBe("ethereum");
  });

  it("calls both RPCs in parallel with correct JSON-RPC body", async () => {
    mockFetch.mockResolvedValue(rpcResponse("0x0"));

    await detectEvmChain("0xTEST");

    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Check both calls use eth_getBalance
    for (const call of mockFetch.mock.calls) {
      const body = JSON.parse(call[1].body);
      expect(body.method).toBe("eth_getBalance");
      expect(body.params).toEqual(["0xTEST", "latest"]);
      expect(body.jsonrpc).toBe("2.0");
    }
  });

  it("uses correct RPC URLs", async () => {
    mockFetch.mockResolvedValue(rpcResponse("0x0"));

    await detectEvmChain("0xABC");

    const urls = mockFetch.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls).toContain("https://ethereum.publicnode.com");
    expect(urls).toContain("https://mainnet.base.org");
  });
});
