import type { Chain } from "./address";

interface JsonRpcResponse {
  result?: string;
  error?: { message: string };
}

const RPC_URLS: Record<string, string> = {
  ethereum: "https://ethereum.publicnode.com",
  base: "https://mainnet.base.org",
};

/**
 * For 0x addresses, probe ETH + Base public RPCs in parallel to detect
 * which chain the wallet is active on. Free, no API key required.
 * Returns the chain with a non-zero native balance, or "ethereum" as default.
 */
export async function detectEvmChain(address: string): Promise<Chain> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const [ethBalance, baseBalance] = await Promise.all([
      fetchNativeBalance(RPC_URLS.ethereum, address, controller.signal),
      fetchNativeBalance(RPC_URLS.base, address, controller.signal),
    ]);

    if (ethBalance > 0 && baseBalance === 0) return "ethereum";
    if (baseBalance > 0 && ethBalance === 0) return "base";
    if (ethBalance > 0 && baseBalance > 0) {
      return baseBalance > ethBalance ? "base" : "ethereum";
    }

    return "ethereum";
  } catch {
    return "ethereum";
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchNativeBalance(
  rpcUrl: string,
  address: string,
  signal: AbortSignal
): Promise<number> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [address, "latest"],
        id: 1,
      }),
      signal,
    });

    if (!res.ok) return 0;

    const data = (await res.json()) as JsonRpcResponse;
    if (!data.result || data.error) return 0;

    return Number.parseInt(data.result, 16);
  } catch {
    return 0;
  }
}
