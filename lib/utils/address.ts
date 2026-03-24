export type Chain = "ethereum" | "base" | "solana";

export interface AddressInfo {
  address: string;
  chain: Chain;
  isEns: boolean;
  displayAddress: string;
}

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ENS_RE = /^[a-zA-Z0-9-]+\.eth$/;

export function detectChain(input: string): Chain | null {
  const trimmed = input.trim();
  if (ENS_RE.test(trimmed)) return "ethereum";
  if (ETH_ADDRESS_RE.test(trimmed)) return "ethereum"; // could also be Base
  if (SOL_ADDRESS_RE.test(trimmed)) return "solana";
  return null;
}

export function isValidAddress(input: string): boolean {
  return detectChain(input) !== null;
}

export function isEvmAddress(input: string): boolean {
  return ETH_ADDRESS_RE.test(input.trim());
}

export function isSolanaAddress(input: string): boolean {
  return SOL_ADDRESS_RE.test(input.trim());
}

export function isEns(input: string): boolean {
  return ENS_RE.test(input.trim());
}

export function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function parseAddressInput(input: string): AddressInfo | null {
  const trimmed = input.trim();
  const chain = detectChain(trimmed);
  if (!chain) return null;

  return {
    address: trimmed,
    chain,
    isEns: isEns(trimmed),
    displayAddress: isEns(trimmed) ? trimmed : truncateAddress(trimmed),
  };
}
