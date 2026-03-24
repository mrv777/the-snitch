import type {
  WalletGraph,
  GraphNode,
  GraphEdge,
  GraphNodeType,
  Suspect,
} from "./types";
import type {
  TraceNode,
  CompareResult,
  RelatedWalletRow,
} from "@/lib/nansen/types";
import { truncateAddress } from "@/lib/utils/address";

interface GraphInput {
  suspects: Suspect[];
  traceData?: TraceNode; // trace result for top suspect
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

  // 2. Walk trace tree (if available)
  if (traceData) {
    walkTraceTree(traceData, nodeMap, edges, suspects);
  }

  // 3. Add related wallets
  for (const [ownerAddr, related] of relatedWallets) {
    const ownerLower = ownerAddr.toLowerCase();
    for (const rel of related) {
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
  if (compareResult) {
    for (const cp of compareResult.shared_counterparties) {
      const cpAddr = cp.address.toLowerCase();
      ensureNode(nodeMap, cpAddr, {
        label: cp.entity_name || truncateAddress(cp.address),
        type: classifyCounterpartyNode(cp.entity_name),
        entityName: cp.entity_name,
      });

      addEdgeIfNew(edges, compareResult.address_a.toLowerCase(), cpAddr, {
        type: "shared_counterparty",
        volumeUsd: cp.volume_usd_a,
      });
      addEdgeIfNew(edges, compareResult.address_b.toLowerCase(), cpAddr, {
        type: "shared_counterparty",
        volumeUsd: cp.volume_usd_b,
      });
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  };
}

// --- Helpers ---

function walkTraceTree(
  node: TraceNode,
  nodeMap: Map<string, GraphNode>,
  edges: GraphEdge[],
  suspects: Suspect[]
): void {
  const addr = node.address.toLowerCase();
  const isSuspect = suspects.some(
    (s) => s.address.toLowerCase() === addr
  );

  if (!isSuspect) {
    ensureNode(nodeMap, addr, {
      label: node.entity_name || node.label || truncateAddress(node.address),
      type: classifyTraceNode(node),
      entityName: node.entity_name,
    });
  }

  // Add transaction edges
  if (node.transactions) {
    for (const tx of node.transactions) {
      const fromAddr = tx.from.toLowerCase();
      const toAddr = tx.to.toLowerCase();

      // Ensure both ends exist
      ensureNode(nodeMap, fromAddr, {
        label: truncateAddress(tx.from),
        type: "related",
      });
      ensureNode(nodeMap, toAddr, {
        label: truncateAddress(tx.to),
        type: "related",
      });

      addEdgeIfNew(edges, fromAddr, toAddr, {
        type: "transaction",
        volumeUsd: tx.value_usd,
        label: tx.token_symbol,
      });
    }
  }

  // Recurse children
  if (node.children) {
    for (const child of node.children) {
      walkTraceTree(child, nodeMap, edges, suspects);
    }
  }
}

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

function classifyTraceNode(node: TraceNode): GraphNodeType {
  const name = (node.entity_name || node.label || "").toLowerCase();
  if (isExchangeLabel(name)) return "exchange";
  if (node.depth === 0) return "suspect";
  if (
    name.includes("fund") ||
    name.includes("deployer") ||
    name.includes("creator")
  )
    return "funding_source";
  return "related";
}

function classifyRelatedNode(rel: RelatedWalletRow): GraphNodeType {
  const name = (rel.entity_name || "").toLowerCase();
  if (isExchangeLabel(name)) return "exchange";
  const relType = (rel.relationship_type || "").toLowerCase();
  if (relType.includes("fund") || relType.includes("source"))
    return "funding_source";
  return "related";
}

function classifyCounterpartyNode(entityName?: string): GraphNodeType {
  if (!entityName) return "related";
  if (isExchangeLabel(entityName.toLowerCase())) return "exchange";
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
