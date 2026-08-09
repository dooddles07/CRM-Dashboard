"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, ClipboardList, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { Task } from "@/lib/types";
import { tasks } from "@/lib/data/work";
import { patientById, staffById, staff } from "@/lib/data/people";
import { taskStatus, priorityMeta } from "@/lib/status";
import { relativeDay } from "@/lib/format";
import { useCareflow } from "@/lib/store";
import { PageHeader } from "@/components/data/page-header";
import { DataTable, selectionColumn } from "@/components/data/data-table";
import { StatusChip } from "@/components/healthcare/status-chip";
import { ParamDialog, Field } from "@/components/shared/create-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const categories = ["Call", "Document", "Coordination", "Review", "Admin"] as const;

export default function TasksPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [owner, setOwner] = useState("all");

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (category !== "all" && t.category !== category) return false;
      if (owner !== "all" && t.ownerId !== owner) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!t.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [status, category, owner, search]);

  const columns = useMemo<ColumnDef<Task, unknown>[]>(
    () => [
      selectionColumn<Task>("tasks"),
      {
        accessorKey: "title",
        header: "Task",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{row.original.title}</p>
            {row.original.patientId && (
              <Link
                href={`/patients/${row.original.patientId}`}
                onClick={(e) => e.stopPropagation()}
                className="text-caption text-ink-3 hover:text-primary"
              >
                {patientById(row.original.patientId)?.name ?? row.original.patientId}
              </Link>
            )}
          </div>
        ),
      },
      { accessorKey: "category", header: "Category" },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => <StatusChip meta={priorityMeta[row.original.priority]} />,
      },
      {
        accessorKey: "dueDate",
        header: "Due",
        cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{relativeDay(row.original.dueDate)}</span>,
      },
      {
        id: "owner",
        header: "Owner",
        accessorFn: (t) => staffById(t.ownerId)?.name ?? "",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusChip meta={taskStatus[row.original.status]} />,
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Tasks"
        description="Operational to-dos across the team — calls to make, documents to chase, handoffs to close."
        actions={
          <Button size="sm" asChild>
            <Link href="/tasks?create=1">
              <Plus className="size-3.5" strokeWidth={2.5} />
              New task
            </Link>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(t) => t.id}
        pageSize={12}
        minWidth="68rem"
        empty={{
          icon: ClipboardList,
          title: "No tasks match",
          description: "Adjust the filters, or create a task to track a piece of work.",
        }}
        bulkActions={(selected, clear) => (
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => {
              toast(`${selected.length} tasks marked done`);
              clear();
            }}
          >
            <CheckCircle2 className="size-3.5" strokeWidth={2} />
            Mark done
          </Button>
        )}
        toolbar={() => (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" strokeWidth={2} />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className="h-8 pl-8" />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger size="sm" className="w-auto min-w-28" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger size="sm" className="w-auto min-w-28" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {Object.entries(taskStatus).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger size="sm" className="w-auto min-w-32" aria-label="Owner">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {staff.filter((s) => s.status === "active").map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      />

      <NewTaskDialog />
    </div>
  );
}

function NewTaskDialog() {
  const logAudit = useCareflow((s) => s.logAudit);
  const [title, setTitle] = useState("");

  return (
    <ParamDialog
      title="New task"
      description="Track a piece of work. In this demo it is not persisted."
      submitLabel="Create task"
      onSubmit={() => {
        if (!title.trim()) {
          toast("Add a title first");
          return false;
        }
        logAudit({
          action: "created",
          resource: "Task",
          resourceId: "TK-new",
          field: "title",
          previousValue: null,
          newValue: title,
        });
        toast("Task created");
      }}
    >
      <Field label="Title" htmlFor="tk-title">
        <Input id="tk-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" htmlFor="tk-cat">
          <Select defaultValue="Call">
            <SelectTrigger id="tk-cat" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Priority" htmlFor="tk-pri">
          <Select defaultValue="medium">
            <SelectTrigger id="tk-pri" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(priorityMeta).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </ParamDialog>
  );
}
