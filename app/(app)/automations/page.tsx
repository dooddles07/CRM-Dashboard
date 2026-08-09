"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search, TriangleAlert, Workflow } from "lucide-react";
import { toast } from "sonner";
import type { WorkflowSummary } from "@/lib/types";
import { workflows } from "@/lib/data/marketing";
import { workflowStatus } from "@/lib/status";
import { relativeDay, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/data/page-header";
import { DataTable } from "@/components/data/data-table";
import { StatusChip } from "@/components/healthcare/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AutomationsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const live = workflows.filter((w) => w.status === "live").length;
  const failing = workflows.filter((w) => w.status === "error").length;
  const totalRuns = workflows.reduce((s, w) => s + w.runs30d, 0);

  const kpis = [
    { label: "Live", value: `${live}`, sub: "workflows running" },
    { label: "Runs (30d)", value: formatNumber(totalRuns), sub: "across all workflows" },
    { label: "Failing", value: `${failing}`, sub: "need attention" },
  ];

  const filtered = useMemo(() => {
    return workflows.filter((w) => {
      if (status !== "all" && w.status !== status) return false;
      if (search && !w.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [status, search]);

  const columns = useMemo<ColumnDef<WorkflowSummary, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Workflow",
        cell: ({ row }) => (
          <Link
            href={`/automations/${row.original.id}`}
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 font-medium text-ink hover:text-primary"
          >
            <p className="truncate">{row.original.name}</p>
            <p className="max-w-96 truncate text-caption font-normal text-ink-3">{row.original.description}</p>
          </Link>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusChip meta={workflowStatus[row.original.status]} />,
      },
      { accessorKey: "trigger", header: "Trigger" },
      {
        accessorKey: "runs30d",
        header: "Runs (30d)",
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.runs30d)}</span>,
      },
      {
        accessorKey: "successRate",
        header: "Success",
        cell: ({ row }) => {
          const r = row.original.successRate;
          return (
            <span className={"tabular-nums " + (r >= 95 ? "text-success" : r >= 85 ? "text-warning" : r > 0 ? "text-danger" : "text-ink-3")}>
              {r > 0 ? `${r}%` : "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) => <span className="whitespace-nowrap text-ink-3">{relativeDay(row.original.updatedAt)}</span>,
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Workflows"
        description="The automations doing the repetitive work — reminders, routing, escalations, and surveys."
        actions={
          <Button size="sm" onClick={() => toast("New workflow", { description: "Opens the builder canvas." })}>
            <Plus className="size-3.5" strokeWidth={2.5} />
            New workflow
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-line bg-surface p-3 shadow-card">
            <p className="text-label text-ink-3">{k.label}</p>
            <p className="mt-1.5 text-[1.5rem] font-semibold leading-7 text-ink tabular-nums">{k.value}</p>
            <p className="mt-0.5 text-caption text-ink-3">{k.sub}</p>
          </div>
        ))}
      </div>

      {failing > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2.5 text-body-sm text-danger">
          <TriangleAlert className="size-4 shrink-0" strokeWidth={2} />
          <span className="font-medium">{failing} workflow {failing === 1 ? "is" : "are"} failing and need attention.</span>
        </div>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(w) => w.id}
        onRowClick={(w) => router.push(`/automations/${w.id}`)}
        pageSize={10}
        minWidth="68rem"
        empty={{
          icon: Workflow,
          title: "No workflows match",
          description: "Adjust the filters, or build a workflow to automate a repetitive task.",
        }}
        toolbar={() => (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" strokeWidth={2} />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search workflows" aria-label="Search workflows" className="h-8 pl-8" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger size="sm" className="w-auto min-w-28" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {Object.entries(workflowStatus).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      />
    </div>
  );
}
