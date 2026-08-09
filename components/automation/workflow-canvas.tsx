"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Clock, GitBranch, Play, Zap } from "lucide-react";
import type { WorkflowGraph, WorkflowNode } from "@/lib/data/marketing";
import type { WorkflowNodeKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const kindStyle: Record<WorkflowNodeKind, { ring: string; icon: typeof Zap; label: string }> = {
  trigger: { ring: "border-ai-line bg-ai-soft text-ai", icon: Zap, label: "Trigger" },
  action: { ring: "border-primary-line bg-primary-soft text-primary-soft-fg", icon: Play, label: "Action" },
  condition: { ring: "border-warning-line bg-warning-soft text-warning", icon: GitBranch, label: "Condition" },
  delay: { ring: "border-line bg-surface-2 text-ink-2", icon: Clock, label: "Delay" },
};

type NodeData = { node: WorkflowNode };

function WorkflowStepNode({ data }: NodeProps<Node<NodeData>>) {
  const { node } = data;
  const style = kindStyle[node.kind];
  const Icon = style.icon;
  return (
    <div className={cn("w-48 rounded-lg border bg-surface p-2.5 shadow-card", "border-line")}>
      <Handle type="target" position={Position.Left} className="!size-2 !border-line !bg-surface-3" />
      <div className="flex items-center gap-1.5">
        <span className={cn("inline-flex size-5 items-center justify-center rounded border", style.ring)}>
          <Icon className="size-3" strokeWidth={2.25} />
        </span>
        <span className="text-label text-ink-3">{style.label}</span>
      </div>
      <p className="mt-1.5 text-body-sm font-medium leading-5 text-ink">{node.label}</p>
      <p className="mt-0.5 text-caption text-ink-3">{node.detail}</p>
      <Handle type="source" position={Position.Right} className="!size-2 !border-line !bg-surface-3" />
    </div>
  );
}

const nodeTypes = { step: WorkflowStepNode };

export function WorkflowCanvas({ graph }: { graph: WorkflowGraph }) {
  const nodes = useMemo<Node<NodeData>[]>(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        type: "step",
        position: { x: n.x * 240, y: n.y * 150 },
        data: { node: n },
      })),
    [graph],
  );

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((e, i) => ({
        id: `e-${i}`,
        source: e.from,
        target: e.to,
        label: e.label,
        animated: true,
        style: { stroke: "var(--line-strong)" },
        labelStyle: { fill: "var(--ink-3)", fontSize: 11 },
        labelBgStyle: { fill: "var(--surface)" },
      })),
    [graph],
  );

  return (
    <div className="h-[32rem] w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        edgesFocusable={false}
        className="rounded-lg [&_.react-flow__background]:!bg-surface-2/40"
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--line-strong)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
