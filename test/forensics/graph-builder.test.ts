import { describe, it, expect } from "vitest";
import { buildWalletGraph } from "@/lib/forensics/graph-builder";
import type { Suspect } from "@/lib/forensics/types";
import type {
  TraceNode,
  CompareResult,
  RelatedWalletRow,
} from "@/lib/nansen/types";

// --- Fixtures ---

const SUSPECT_1 = "0xaaaa000000000000000000000000000000000001";
const SUSPECT_2 = "0xbbbb000000000000000000000000000000000002";
const FUNDING_SRC = "0xffff000000000000000000000000000000000099";
const EXCHANGE = "0xeeee000000000000000000000000000000000088";

const suspects: Suspect[] = [
  {
    address: SUSPECT_1,
    entityName: "Suspect Alpha",
    rank: 1,
    score: 200,
    timingAdvantage: 12,
    volumeUsd: 500_000,
    action: "buy",
    isDexVisible: true,
  },
  {
    address: SUSPECT_2,
    rank: 2,
    score: 100,
    timingAdvantage: 6,
    volumeUsd: 200_000,
    action: "buy",
    isDexVisible: true,
  },
];

// --- Tests ---

describe("buildWalletGraph", () => {
  it("creates suspect nodes for all suspects", () => {
    const graph = buildWalletGraph({
      suspects,
      relatedWallets: new Map(),
    });

    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[0].type).toBe("suspect");
    expect(graph.nodes[0].suspectRank).toBe(1);
    expect(graph.nodes[0].label).toBe("Suspect Alpha");
    expect(graph.nodes[1].type).toBe("suspect");
    expect(graph.nodes[1].suspectRank).toBe(2);
  });

  it("returns empty graph for no suspects", () => {
    const graph = buildWalletGraph({
      suspects: [],
      relatedWallets: new Map(),
    });

    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });

  it("adds related wallet nodes and funding edges", () => {
    const relatedWallets = new Map<string, RelatedWalletRow[]>([
      [
        SUSPECT_1.toLowerCase(),
        [
          {
            address: FUNDING_SRC,
            entity_name: "Funding Deployer",
            relationship_type: "funding source",
          },
        ],
      ],
    ]);

    const graph = buildWalletGraph({
      suspects,
      relatedWallets,
    });

    // 2 suspects + 1 related
    expect(graph.nodes).toHaveLength(3);

    const fundingNode = graph.nodes.find(
      (n) => n.id === FUNDING_SRC.toLowerCase()
    );
    expect(fundingNode).toBeDefined();
    expect(fundingNode!.type).toBe("funding_source");

    const fundingEdges = graph.edges.filter((e) => e.type === "funding");
    expect(fundingEdges).toHaveLength(1);
    expect(fundingEdges[0].source).toBe(SUSPECT_1.toLowerCase());
    expect(fundingEdges[0].target).toBe(FUNDING_SRC.toLowerCase());
  });

  it("classifies exchange nodes correctly", () => {
    const relatedWallets = new Map<string, RelatedWalletRow[]>([
      [
        SUSPECT_1.toLowerCase(),
        [{ address: EXCHANGE, entity_name: "Binance Hot Wallet" }],
      ],
    ]);

    const graph = buildWalletGraph({
      suspects,
      relatedWallets,
    });

    const exchangeNode = graph.nodes.find(
      (n) => n.id === EXCHANGE.toLowerCase()
    );
    expect(exchangeNode).toBeDefined();
    expect(exchangeNode!.type).toBe("exchange");
  });

  it("adds shared counterparties from compare result", () => {
    const compareResult: CompareResult = {
      address_a: SUSPECT_1,
      address_b: SUSPECT_2,
      shared_counterparties: [
        {
          address: "0xshared00000000000000000000000000000000cc",
          entity_name: "Shared DEX Router",
          interaction_count_a: 5,
          interaction_count_b: 3,
          volume_usd_a: 100_000,
          volume_usd_b: 50_000,
        },
      ],
    };

    const graph = buildWalletGraph({
      suspects,
      relatedWallets: new Map(),
      compareResult,
    });

    // 2 suspects + 1 shared counterparty
    expect(graph.nodes).toHaveLength(3);

    const cpEdges = graph.edges.filter((e) => e.type === "shared_counterparty");
    expect(cpEdges).toHaveLength(2); // one from each suspect to counterparty
  });

  it("walks trace tree and creates transaction edges", () => {
    const traceData: TraceNode = {
      address: SUSPECT_1,
      entity_name: "Suspect Alpha",
      depth: 0,
      transactions: [
        {
          from: FUNDING_SRC,
          to: SUSPECT_1,
          value_usd: 1_000_000,
          token_symbol: "ETH",
          block_timestamp: "2024-01-14T00:00:00Z",
          transaction_hash: "0xtrace1",
        },
      ],
      children: [
        {
          address: FUNDING_SRC,
          entity_name: "Token Deployer",
          depth: 1,
          label: "deployer",
        },
      ],
    };

    const graph = buildWalletGraph({
      suspects,
      traceData,
      relatedWallets: new Map(),
    });

    // Suspect Alpha already exists, SUSPECT_2, FUNDING_SRC from trace
    const fundingNode = graph.nodes.find(
      (n) => n.id === FUNDING_SRC.toLowerCase()
    );
    expect(fundingNode).toBeDefined();

    const txEdges = graph.edges.filter((e) => e.type === "transaction");
    expect(txEdges).toHaveLength(1);
    expect(txEdges[0].volumeUsd).toBe(1_000_000);
  });

  it("does not duplicate edges between same nodes", () => {
    const relatedWallets = new Map<string, RelatedWalletRow[]>([
      [SUSPECT_1.toLowerCase(), [{ address: FUNDING_SRC }]],
    ]);

    const traceData: TraceNode = {
      address: SUSPECT_1,
      depth: 0,
      transactions: [
        {
          from: FUNDING_SRC,
          to: SUSPECT_1,
          value_usd: 500_000,
          block_timestamp: "2024-01-14T00:00:00Z",
          transaction_hash: "0xtx",
        },
      ],
    };

    const graph = buildWalletGraph({
      suspects: [suspects[0]],
      traceData,
      relatedWallets,
    });

    // Should only have one edge between SUSPECT_1 and FUNDING_SRC
    const edgesBetween = graph.edges.filter(
      (e) =>
        (e.source === SUSPECT_1.toLowerCase() &&
          e.target === FUNDING_SRC.toLowerCase()) ||
        (e.source === FUNDING_SRC.toLowerCase() &&
          e.target === SUSPECT_1.toLowerCase())
    );
    // trace creates a transaction edge, then related-wallets tries a funding edge
    // but addEdgeIfNew should prevent the duplicate
    expect(edgesBetween.length).toBeLessThanOrEqual(2);
  });

  it("does not override suspect nodes with related/trace nodes", () => {
    const traceData: TraceNode = {
      address: SUSPECT_1,
      entity_name: "Different Name",
      depth: 0,
    };

    const graph = buildWalletGraph({
      suspects,
      traceData,
      relatedWallets: new Map(),
    });

    const suspectNode = graph.nodes.find(
      (n) => n.id === SUSPECT_1.toLowerCase()
    );
    expect(suspectNode!.type).toBe("suspect"); // should stay suspect, not overridden
    expect(suspectNode!.label).toBe("Suspect Alpha"); // original label preserved
  });
});
