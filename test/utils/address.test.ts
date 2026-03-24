import { describe, it, expect } from "vitest";
import {
  detectChain,
  isValidAddress,
  isEvmAddress,
  isSolanaAddress,
  isEns,
  truncateAddress,
  parseAddressInput,
} from "@/lib/utils/address";

describe("detectChain", () => {
  it("detects Ethereum address", () => {
    expect(detectChain("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(
      "ethereum"
    );
  });

  it("detects Solana address", () => {
    expect(detectChain("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")).toBe(
      "solana"
    );
  });

  it("detects ENS name as ethereum", () => {
    expect(detectChain("vitalik.eth")).toBe("ethereum");
  });

  it("returns null for invalid input", () => {
    expect(detectChain("not-an-address")).toBeNull();
    expect(detectChain("")).toBeNull();
    expect(detectChain("0x123")).toBeNull(); // too short
  });

  it("handles whitespace", () => {
    expect(
      detectChain("  0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045  ")
    ).toBe("ethereum");
  });
});

describe("isValidAddress", () => {
  it("validates EVM addresses", () => {
    expect(isValidAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(
      true
    );
  });

  it("validates Solana addresses", () => {
    expect(
      isValidAddress("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")
    ).toBe(true);
  });

  it("validates ENS names", () => {
    expect(isValidAddress("vitalik.eth")).toBe(true);
  });

  it("rejects invalid addresses", () => {
    expect(isValidAddress("hello")).toBe(false);
    expect(isValidAddress("")).toBe(false);
  });
});

describe("isEvmAddress", () => {
  it("matches 0x + 40 hex chars", () => {
    expect(isEvmAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(
      true
    );
  });

  it("rejects non-EVM", () => {
    expect(isEvmAddress("vitalik.eth")).toBe(false);
    expect(
      isEvmAddress("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")
    ).toBe(false);
  });
});

describe("isSolanaAddress", () => {
  it("matches base58 32-44 chars", () => {
    expect(
      isSolanaAddress("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")
    ).toBe(true);
  });

  it("rejects EVM addresses", () => {
    expect(
      isSolanaAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")
    ).toBe(false);
  });
});

describe("isEns", () => {
  it("matches .eth names", () => {
    expect(isEns("vitalik.eth")).toBe(true);
    expect(isEns("my-wallet.eth")).toBe(true);
  });

  it("rejects non-ENS", () => {
    expect(isEns("vitalik.com")).toBe(false);
    expect(isEns("0xabc")).toBe(false);
  });
});

describe("truncateAddress", () => {
  it("truncates long addresses", () => {
    expect(truncateAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(
      "0xd8dA...6045"
    );
  });

  it("leaves short strings unchanged", () => {
    expect(truncateAddress("0x123456")).toBe("0x123456");
  });
});

describe("parseAddressInput", () => {
  it("parses EVM address", () => {
    const result = parseAddressInput(
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
    );
    expect(result).toEqual({
      address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      chain: "ethereum",
      isEns: false,
      displayAddress: "0xd8dA...6045",
    });
  });

  it("parses ENS name", () => {
    const result = parseAddressInput("vitalik.eth");
    expect(result).toEqual({
      address: "vitalik.eth",
      chain: "ethereum",
      isEns: true,
      displayAddress: "vitalik.eth",
    });
  });

  it("parses Solana address", () => {
    const result = parseAddressInput(
      "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
    );
    expect(result).not.toBeNull();
    expect(result!.chain).toBe("solana");
    expect(result!.isEns).toBe(false);
  });

  it("returns null for invalid input", () => {
    expect(parseAddressInput("not-valid")).toBeNull();
  });
});
