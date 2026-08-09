"use client";

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Pause, Pencil, Play, Workflow } from "lucide-react";
import { toast } from "sonner";
import type { WorkflowNode, WorkflowGraph } from "@/lib/data/marketing";
import type { WorkflowNodeKind } from "@/lib/types";
import { workflowById, workflowGraphs } from "@/lib/data/marketing";
import { workflowStatus } from "@/lib/status";
import { formatNumber, formatTime, relativeDay } from "@/lib/format";
import { at } from "@/lib/data/constants";
import dynamic from "next/dynamic";
import { RecordHeader } from "@/components/record/record-header";
import { TabPanel } from "@/components/patient/tabs";
import { StatusChip } from "@/components/healthcare/status-chip";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";

const WorkflowCanvas = dynamic(
  () => import("@/components/automation/workflow-canvas").then((m) => m.WorkflowCanvas),
  {
    ssr: false,
    loading: () => <div className="h-[32rem] w-full animate-pulse bg-surface-2/40" />,
  },
);

/** A simple left-to-right sketch for workflows without an authored graph. */
function sketchGraph(nodeCount: number, trigger: string): WorkflowGraph {
  const kinds: WorkflowNodeKind[] = ["trigger", "action", "condition", "action", "delay", "action"];
  const nodes: WorkflowNode[] = Array.from({ length: Math.max(nodeCount, 2) }, (_, i) => ({
    id: `n${i + 1}`,
    kind: i === 0 ? "trigger" : kinds[i % kinds.length],
    label: i === 0 ? trigger : `Step ${i + 1}`,
    detail: i === 0 ? "Starts the workflow" : "Configured action",
    x: i,
    y: 1,
  }));
  const edges = nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id }));
  return { nodes, edges };
}

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tab = useSearchParams().get("tab") ?? "builder";
  const workflow = workflowById(id);

  if (!workflow) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState
          icon={Workflow}
          title="We could not find that workflow"
          description="It may have been deleted or renamed."
          reference={id}
          action={
            <Button size="sm" asChild>
              <Link href="/automations">Back to workflows</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const graph = workflowGraphs[workflow.id] ?? sketchGraph(workflow.nodeCount, workflow.trigger);
  const live = workflow.status === "live";

  const runs = Array.from({ length: 8 }, (_, i) => {
    const ok = !(workflow.status === "error" && i % 3 === 0);
    const hh = String(9 + (i % 8)).padStart(2, "0");
    const mm = String((i * 7) % 60).padStart(2, "0");
    return {
      at: at(-i, `${hh}:${mm}`),
      ok,
      ms: 400 + ((i * 137) % 900),
    };
  });

  return (
    <div className="mx-auto max-w-[100rem]">
      <RecordHeader
        breadcrumb={{ label: "Workflows", href: "/automations" }}
        avatar={
          <span className="inline-flex size-12 items-center justify-center rounded-lg border border-primary-line bg-primary-soft text-primary-soft-fg">
            <Workflow className="size-6" strokeWidth={1.75} />
          </span>
        }
        title={workflow.name}
        identifier={workflow.id}
        chips={<StatusChip meta={workflowStatus[workflow.status]} size="md" />}
        facts={[
          { label: "Trigger", value: workflow.trigger },
          { label: "Runs (30d)", value: formatNumber(workflow.runs30d) },
          { label: "Success rate", value: workflow.successRate > 0 ? `${workflow.successRate}%` : "—" },
          { label: "Updated", value: relativeDay(workflow.updatedAt) },
        ]}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => toast(live ? "Workflow paused" : "Workflow activated")}>
              {live ? <Pause className="size-3.5" strokeWidth={2} /> : <Play className="size-3.5" strokeWidth={2} />}
              {live ? "Pause" : "Activate"}
            </Button>
            <Button size="sm" onClick={() => toast("Editing enabled", { description: "Drag nodes to rearrange the flow." })}>
              <Pencil className="size-3.5" strokeWidth={2} />
              Edit
            </Button>
          </>
        }
        tabs={[
          { id: "builder", label: "Builder" },
          { id: "runs", label: "Recent runs", count: runs.length },
          { id: "settings", label: "Settings" },
        ]}
        activeTab={tab}
      />

      {tab === "builder" && (
        <Panel>
          <PanelHeader title="Flow" description="Trigger, conditions, and actions. Scroll to pan, pinch to zoom." />
          <WorkflowCanvas graph={graph} />
        </Panel>
      )}

      {tab === "runs" && (
        <TabPanel title="Recent runs" description="The last few executions of this workflow.">
          <ul className="divide-y divide-line">
            {runs.map((r, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-2.5">
                <span className="flex items-center gap-2 text-body-sm">
                  <StatusChip
                    meta={r.ok ? workflowStatus.live : workflowStatus.error}
                    label={r.ok ? "Success" : "Failed"}
                  />
                  <time className="text-ink-3 tabular-nums">{formatTime(r.at)}</time>
                </span>
                <span className="text-caption text-ink-3 tabular-nums">{r.ms} ms</span>
              </li>
            ))}
          </ul>
        </TabPanel>
      )}

      {tab === "settings" && (
        <div className="grid items-start gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <Panel>
            <PanelHeader title="Configuration" />
            <PanelBody className="space-y-3">
              <Row label="Trigger" value={workflow.trigger} />
              <Row label="Status" value={workflowStatus[workflow.status].label} />
              <Row label="Steps" value={`${workflow.nodeCount}`} />
              <Row label="Description" value={workflow.description} />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Danger zone" />
            <PanelBody className="space-y-3">
              <p className="text-body-sm text-ink-3">
                Pausing stops new runs immediately. Deleting removes the workflow and its history.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => toast("Workflow paused")}>
                  Pause workflow
                </Button>
                <Button size="sm" variant="outline" className="text-danger hover:text-danger" onClick={() => toast("Delete workflow", { description: "This would remove it permanently." })}>
                  Delete
                </Button>
              </div>
            </PanelBody>
          </Panel>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-body-sm">
      <span className="shrink-0 text-ink-3">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}
