"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isEvmAddress, isSolanaAddress } from "@/lib/utils/address";

interface SearchResult {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number | null;
  thumb: string;
  platforms?: Record<string, string>;
}

type EvmChain = "ethereum" | "base";

export function TokenInput() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [chain, setChain] = useState<EvmChain>("ethereum");
  const [showChainSelector, setShowChainSelector] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Determine if we need chain selector (EVM addresses only)
  useEffect(() => {
    const trimmed = input.trim();
    setShowChainSelector(isEvmAddress(trimmed));
  }, [input]);

  // CoinGecko search with debounce
  const searchTokens = useCallback(async (query: string) => {
    if (query.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    // Don't search if it looks like an address
    if (isEvmAddress(query) || isSolanaAddress(query)) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/search/token?q=${encodeURIComponent(query)}`
      );
      if (!res.ok) return;
      const data: SearchResult[] = await res.json();
      setResults(data);
      setShowDropdown(data.length > 0);
    } catch {
      // Silent fail — search is a nice-to-have
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchTokens(input), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, searchTokens]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectToken(result: SearchResult) {
    // Try to find a contract address for the selected chain
    const platforms = result.platforms || {};
    const address =
      platforms.ethereum || platforms.base || platforms.solana || "";
    if (address) {
      setInput(address);
      if (platforms.solana && !platforms.ethereum && !platforms.base) {
        // Solana token — no chain selector needed
      } else if (platforms.base && !platforms.ethereum) {
        setChain("base");
      }
    } else {
      setInput(result.name);
    }
    setShowDropdown(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = input.trim();

    if (!trimmed) {
      setError("Enter a token address or name");
      return;
    }

    // Validate address format
    if (isEvmAddress(trimmed)) {
      setLoading(true);
      router.push(
        `/investigate/token/${encodeURIComponent(trimmed)}?chain=${chain}`
      );
      return;
    }

    if (isSolanaAddress(trimmed)) {
      setLoading(true);
      router.push(
        `/investigate/token/${encodeURIComponent(trimmed)}?chain=solana`
      );
      return;
    }

    setError(
      "Enter a valid token address (0x... for EVM, or base58 for Solana)"
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative" ref={dropdownRef}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError("");
              }}
              placeholder="Token address or search by name..."
              className="w-full border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-green focus:outline-none transition-colors"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {showChainSelector && (
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value as EvmChain)}
              className="border border-border bg-bg-secondary px-3 py-3 text-xs uppercase tracking-wider text-text-secondary focus:border-accent-green focus:outline-none"
            >
              <option value="ethereum">ETH</option>
              <option value="base">BASE</option>
            </select>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-accent-green px-6 py-3 text-xs font-bold uppercase tracking-wider text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "..." : "Investigate"}
          </button>
        </div>

        {/* CoinGecko search dropdown */}
        {showDropdown && (
          <div className="absolute z-50 mt-1 w-full border border-border bg-bg-secondary shadow-lg">
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => selectToken(result)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-bg-card transition-colors"
              >
                {result.thumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={result.thumb}
                    alt=""
                    className="h-5 w-5 rounded-full"
                  />
                )}
                <span className="text-sm text-text-primary">
                  {result.name}
                </span>
                <span className="text-xs uppercase text-text-dim">
                  {result.symbol}
                </span>
                {result.market_cap_rank && (
                  <span className="ml-auto text-[10px] text-text-dim">
                    #{result.market_cap_rank}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-verdict-red">{error}</p>
      )}

      <p className="mt-2 text-[11px] text-text-dim">
        ETH / Base / Solana — chain auto-detected from address format
      </p>
    </form>
  );
}
