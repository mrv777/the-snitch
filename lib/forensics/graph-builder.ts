import type {
  WalletGraph,
  GraphNode,
  GraphEdge,
  GraphNodeType,
  Suspect,
} from "./types";
import type {
  TraceResult,
  CompareResult,
  RelatedWalletRow,
} from "@/lib/nansen/types";
import { truncateAddress } from "@/lib/utils/address";

interface GraphInput {
  suspects: Suspect[];
  traceData?: TraceResult; // trace result for top suspect
  relatedWallets: Map<string, RelatedWalletRow[]>; // address → related wallets
  compareResult?: CompareResult;
}

/**
 * Build a d3-force compatible wallet graph from investigation data.
 */
export function buildWalletGraph(input: GraphInput): WalletGraph {
  const { suspects, traceData, relatedWallets, compareResult } = input;
  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // 1. Add suspect nodes
  for (const suspect of suspects) {
    const addr = suspect.address.toLowerCase();
    nodeMap.set(addr, {
      id: addr,
      label: suspect.entityName || truncateAddress(suspect.address),
      type: "suspect",
      suspectRank: suspect.rank,
      entityName: suspect.entityName,
    });
  }

  // 2. Process trace data (flat nodes + edges format)
  if (traceData?.nodes && traceData?.edges) {
    const suspectAddrs = new Set(suspects.map((s) => s.address.toLowerCase()));

    // Add trace nodes
    for (const nodeAddr of traceData.nodes) {
      if (!nodeAddr) continue;
      const addr = nodeAddr.toLowerCase();
      if (!suspectAddrs.has(addr)) {
        ensureNode(nodeMap, addr, {
          label: truncateAddress(nodeAddr),
          type: "related",
        });
      }
    }

    // Add trace edges
    for (const edge of traceData.edges) {
      if (!edge.from || !edge.to) continue;
      const fromAddr = edge.from.toLowerCase();
      const toAddr = edge.to.toLowerCase();

      ensureNode(nodeMap, fromAddr, {
        label: truncateAddress(edge.from),
        type: "related",
      });
      ensureNode(nodeMap, toAddr, {
        label: truncateAddress(edge.to),
        type: "related",
      });

      addEdgeIfNew(edges, fromAddr, toAddr, {
        type: "transaction",
        volumeUsd: edge.volume_usd,
      });
    }
  }

  // 3. Add related wallets
  for (const [ownerAddr, related] of relatedWallets) {
    const ownerLower = ownerAddr.toLowerCase();
    for (const rel of related) {
      if (!rel.address) continue;
      const relAddr = rel.address.toLowerCase();
      ensureNode(nodeMap, relAddr, {
        label: rel.entity_name || truncateAddress(rel.address),
        type: classifyRelatedNode(rel),
        entityName: rel.entity_name,
      });

      addEdgeIfNew(edges, ownerLower, relAddr, {
        type: "funding",
        label: rel.relationship_type || "related",
      });
    }
  }

  // 4. Add compare shared counterparties
  const sharedCps = compareResult?.shared_counterparties;
  const cmpAddrs = compareResult?.addresses;
  if (sharedCps && sharedCps.length > 0 && cmpAddrs && cmpAddrs.length >= 2) {
    const addrA = cmpAddrs[0].toLowerCase();
    const addrB = cmpAddrs[1].toLowerCase();
    for (const cpAddr of sharedCps) {
      if (!cpAddr) continue;
      const addr = cpAddr.toLowerCase();
      ensureNode(nodeMap, addr, {
        label: truncateAddress(cpAddr),
        type: "related",
      });

      addEdgeIfNew(edges, addrA, addr, {
        type: "shared_counterparty",
      });
      addEdgeIfNew(edges, addrB, addr, {
        type: "shared_counterparty",
      });
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  };
}

// --- Helpers ---

function ensureNode(
  nodeMap: Map<string, GraphNode>,
  address: string,
  defaults: Omit<GraphNode, "id">
): void {
  if (!nodeMap.has(address)) {
    nodeMap.set(address, { id: address, ...defaults });
  }
}

function addEdgeIfNew(
  edges: GraphEdge[],
  source: string,
  target: string,
  props: Omit<GraphEdge, "source" | "target">
): void {
  const exists = edges.some(
    (e) =>
      (e.source === source && e.target === target) ||
      (e.source === target && e.target === source)
  );
  if (!exists) {
    edges.push({ source, target, ...props });
  }
}

function classifyRelatedNode(rel: RelatedWalletRow): GraphNodeType {
  const name = (rel.entity_name || "").toLowerCase();
  if (isExchangeLabel(name)) return "exchange";
  const relType = (rel.relationship_type || "").toLowerCase();
  if (relType.includes("fund") || relType.includes("source"))
    return "funding_source";
  return "related";
}

function isExchangeLabel(name: string): boolean {
  const exchanges = [
    "binance", "coinbase", "kraken", "okx", "bybit",
    "kucoin", "gate", "huobi", "htx", "bitfinex",
    "gemini", "bitstamp", "uniswap", "sushiswap",
    "pancakeswap", "curve", "aave", "compound",
  ];
  return exchanges.some((ex) => name.includes(ex));
}
