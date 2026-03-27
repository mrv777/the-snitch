import { describe, it, expect } from "vitest";
import { buildWalletGraph } from "@/lib/forensics/graph-builder";
import type { Suspect } from "@/lib/forensics/types";
import type {
  TraceResult,
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
      addresses: [SUSPECT_1, SUSPECT_2],
      chain: "ethereum",
      shared_counterparties: [
        "0xshared00000000000000000000000000000000cc",
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

  it("processes trace data and creates transaction edges", () => {
    const traceData: TraceResult = {
      root: SUSPECT_1,
      chain: "ethereum",
      depth: 2,
      nodes: [SUSPECT_1, FUNDING_SRC],
      edges: [
        {
          from: FUNDING_SRC,
          to: SUSPECT_1,
          volume_usd: 1_000_000,
        },
      ],
    };

    const graph = buildWalletGraph({
      suspects,
      traceData,
      relatedWallets: new Map(),
    });

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

    const traceData: TraceResult = {
      root: SUSPECT_1,
      chain: "ethereum",
      depth: 1,
      nodes: [SUSPECT_1, FUNDING_SRC],
      edges: [
        {
          from: FUNDING_SRC,
          to: SUSPECT_1,
          volume_usd: 500_000,
        },
      ],
    };

    const graph = buildWalletGraph({
      suspects: [suspects[0]],
      traceData,
      relatedWallets,
    });

    const edgesBetween = graph.edges.filter(
      (e) =>
        (e.source === SUSPECT_1.toLowerCase() &&
          e.target === FUNDING_SRC.toLowerCase()) ||
        (e.source === FUNDING_SRC.toLowerCase() &&
          e.target === SUSPECT_1.toLowerCase())
    );
    expect(edgesBetween.length).toBeLessThanOrEqual(2);
  });

  it("does not override suspect nodes with trace nodes", () => {
    const traceData: TraceResult = {
      root: SUSPECT_1,
      chain: "ethereum",
      depth: 1,
      nodes: [SUSPECT_1],
      edges: [],
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
