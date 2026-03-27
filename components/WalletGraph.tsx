"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { WalletGraph, GraphEdge, GraphNodeType } from "@/lib/forensics/types";
import { truncateAddress } from "@/lib/utils/address";

interface Props {
  graph: WalletGraph;
}

const NODE_COLORS: Record<GraphNodeType, string> = {
  suspect: "#FF4444",
  related: "#888888",
  funding_source: "#FFB800",
  exchange: "#00D4FF",
};

const NODE_RADIUS: Record<GraphNodeType, number> = {
  suspect: 20,
  related: 12,
  funding_source: 16,
  exchange: 14,
};

interface SimNode extends SimulationNodeDatum {
  id: string;
  label: string;
  type: GraphNodeType;
  suspectRank?: number;
  entityName?: string;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  type: GraphEdge["type"];
  label?: string;
}

export function WalletGraphViz({ graph }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    node: SimNode;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{
    node: SimNode | null;
    startX: number;
    startY: number;
  }>({ node: null, startX: 0, startY: 0 });
  const panRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    const { x: tx, y: ty, k } = transformRef.current;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    // Scale for DPR first, then work in CSS pixel coordinates
    ctx.scale(dpr, dpr);
    const cssW = width / dpr;
    const cssH = height / dpr;
    ctx.translate(tx + cssW / 2, ty + cssH / 2);
    ctx.scale(k, k);

    // Draw edges
    for (const link of linksRef.current) {
      const source = link.source as SimNode;
      const target = link.target as SimNode;
      if (source.x == null || source.y == null || target.x == null || target.y == null) continue;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle =
        link.type === "funding"
          ? "#FFB80040"
          : link.type === "shared_counterparty"
            ? "#00D4FF40"
            : "#2A2A2A";
      ctx.lineWidth = link.type === "funding" ? 2 : 1;
      ctx.stroke();
    }

    // Draw nodes
    for (const node of nodesRef.current) {
      if (node.x == null || node.y == null) continue;
      const r = NODE_RADIUS[node.type];
      const color = NODE_COLORS[node.type];

      // Glow for suspects
      if (node.type === "suspect") {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = `${color}20`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `${color}30`;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      // Label
      ctx.fillStyle = "#E0E0E0";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(
        node.entityName || truncateAddress(node.id),
        node.x,
        node.y + r + 4
      );

      // Suspect rank badge
      if (node.suspectRank) {
        ctx.fillStyle = color;
        ctx.font = "bold 10px monospace";
        ctx.textBaseline = "middle";
        ctx.fillText(`#${node.suspectRank}`, node.x, node.y);
      }
    }

    ctx.restore();
  }, []);

  // Initialize simulation
  useEffect(() => {
    if (graph.nodes.length === 0) return;

    const nodes: SimNode[] = graph.nodes.map((n) => ({
      ...n,
      x: undefined,
      y: undefined,
    }));
    const links: SimLink[] = graph.edges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
      label: e.label,
    }));

    nodesRef.current = nodes;
    linksRef.current = links;

    const simulation = forceSimulation(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(80)
      )
      .force("charge", forceManyBody().strength(-200))
      .force("center", forceCenter(0, 0))
      .force(
        "collide",
        forceCollide<SimNode>().radius((d) => NODE_RADIUS[d.type] + 10)
      )
      .on("tick", draw)
      .on("end", () => {
        // Auto-fit viewport to show all nodes after simulation settles
        const canvas = canvasRef.current;
        if (!canvas || nodes.length === 0) return;

        const validNodes = nodes.filter((n) => n.x != null && n.y != null);
        if (validNodes.length === 0) return;

        const xs = validNodes.map((n) => n.x!);
        const ys = validNodes.map((n) => n.y!);
        const minX = Math.min(...xs) - 40;
        const maxX = Math.max(...xs) + 40;
        const minY = Math.min(...ys) - 40;
        const maxY = Math.max(...ys) + 40;

        const graphW = maxX - minX;
        const graphH = maxY - minY;
        const canvasW = canvas.width / (window.devicePixelRatio || 1);
        const canvasH = canvas.height / (window.devicePixelRatio || 1);

        // Scale to fit, cap at 1.5x to avoid over-zoom on small graphs
        const scale = Math.min(canvasW / graphW, canvasH / graphH, 1.5);
        // The draw function already translates by (width/2, height/2) before applying transform,
        // so tx/ty just need to center the graph's center point at the origin
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        transformRef.current = { x: -cx * scale, y: -cy * scale, k: scale };
        draw();
      });

    return () => {
      simulation.stop();
    };
  }, [graph, draw]);

  // Resize canvas
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const { width, height } = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      draw();
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  function getNodeAtPos(
    clientX: number,
    clientY: number
  ): SimNode | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { x: tx, y: ty, k } = transformRef.current;
    const mx = (clientX - rect.left - rect.width / 2 - tx) / k;
    const my = (clientY - rect.top - rect.height / 2 - ty) / k;

    for (const node of nodesRef.current) {
      if (node.x == null || node.y == null) continue;
      const r = NODE_RADIUS[node.type];
      const dx = mx - node.x;
      const dy = my - node.y;
      if (dx * dx + dy * dy <= r * r) return node;
    }
    return null;
  }

  function handleMouseMove(e: React.MouseEvent) {
    // Handle drag
    if (dragRef.current.node) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const { x: tx, y: ty, k } = transformRef.current;
      dragRef.current.node.fx =
        (e.clientX - rect.left - rect.width / 2 - tx) / k;
      dragRef.current.node.fy =
        (e.clientY - rect.top - rect.height / 2 - ty) / k;
      draw();
      return;
    }

    // Handle pan
    if (panRef.current.active) {
      transformRef.current.x =
        panRef.current.origX + (e.clientX - panRef.current.startX);
      transformRef.current.y =
        panRef.current.origY + (e.clientY - panRef.current.startY);
      draw();
      return;
    }

    // Hover tooltip
    const node = getNodeAtPos(e.clientX, e.clientY);
    if (node) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        node,
      });
    } else {
      setTooltip(null);
    }
  }

  function handleMouseDown(e: React.MouseEvent) {
    const node = getNodeAtPos(e.clientX, e.clientY);
    if (node) {
      dragRef.current = { node, startX: e.clientX, startY: e.clientY };
      node.fx = node.x;
      node.fy = node.y;
    } else {
      panRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        origX: transformRef.current.x,
        origY: transformRef.current.y,
      };
    }
  }

  function handleMouseUp() {
    if (dragRef.current.node) {
      dragRef.current.node.fx = null;
      dragRef.current.node.fy = null;
      dragRef.current.node = null;
      draw();
    }
    panRef.current.active = false;
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    transformRef.current.k = Math.max(
      0.3,
      Math.min(3, transformRef.current.k * delta)
    );
    draw();
  }

  function handleClick(e: React.MouseEvent) {
    const node = getNodeAtPos(e.clientX, e.clientY);
    if (node) {
      navigator.clipboard.writeText(node.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  if (graph.nodes.length === 0) return null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">
          Wallet Connection Graph
        </p>
        {copied && (
          <span className="text-[10px] text-accent-green">
            Address copied!
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative h-[500px] border border-border bg-bg-secondary overflow-hidden cursor-grab active:cursor-grabbing"
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onClick={handleClick}
        />

        {/* Tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 border border-border bg-bg-primary px-3 py-2 text-xs shadow-lg"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y - 8,
            }}
          >
            <p className="font-mono text-text-primary">{tooltip.node.id}</p>
            {tooltip.node.entityName && (
              <p className="text-text-secondary">{tooltip.node.entityName}</p>
            )}
            <p
              className="text-[10px] uppercase tracking-wider"
              style={{ color: NODE_COLORS[tooltip.node.type] }}
            >
              {tooltip.node.type.replace("_", " ")}
            </p>
            <p className="mt-1 text-[10px] text-text-dim">Click to copy address</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-4">
        {(
          [
            ["suspect", "Suspect"],
            ["funding_source", "Funding Source"],
            ["exchange", "Exchange"],
            ["related", "Related"],
          ] as const
        ).map(([type, label]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: NODE_COLORS[type] }}
            />
            <span className="text-[10px] text-text-dim">{label}</span>
          </div>
        ))}
      </div>

      {/* Mark as ready for Playwright screenshot (Phase 5) */}
      <div className="graph-ready hidden" />
    </div>
  );
}
