"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Plus, Search, Timer } from "lucide-react";
import { toast } from "sonner";
import type { FollowUp } from "@/lib/types";
import { followUps } from "@/lib/data/work";
import { patientById, staffById, staff } from "@/lib/data/people";
import { followUpStatus, priorityMeta } from "@/lib/status";
import { daysFromToday, relativeDay } from "@/lib/format";
import { useCareflow } from "@/lib/store";
import { PageHeader } from "@/components/data/page-header";
import { DataTable, selectionColumn } from "@/components/data/data-table";
import { StatusChip } from "@/components/healthcare/status-chip";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { ParamDialog, Field } from "@/components/shared/create-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const views = [
  { id: "all", label: "All" },
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Due today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
] as const;

type ViewId = (typeof views)[number]["id"];

export default function FollowUpsPage() {
  const [view, setView] = useState<ViewId>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return followUps.filter((f) => {
      const delta = daysFromToday(f.dueDate);
      if (view === "overdue" && f.status !== "overdue") return false;
      if (view === "today" && delta !== 0) return false;
      if (view === "upcoming" && (delta <= 0 || f.status === "completed")) return false;
      if (view === "completed" && f.status !== "completed") return false;
      if (search) {
        const q = search.toLowerCase();
        const patient = patientById(f.patientId);
        if (!patient?.name.toLowerCase().includes(q) && !f.type.toLowerCase().includes(q) && !f.note.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [view, search]);

  const counts = {
    overdue: followUps.filter((f) => f.status === "overdue").length,
  };

  const columns = useMemo<ColumnDef<FollowUp, unknown>[]>(
    () => [
      selectionColumn<FollowUp>("follow-ups"),
      {
        id: "patient",
        header: "Patient",
        accessorFn: (f) => patientById(f.patientId)?.name ?? f.patientId,
        cell: ({ row }) => {
          const p = patientById(row.original.patientId);
          return (
            <Link
              href={`/patients/${row.original.patientId}?tab=follow-ups`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 font-medium text-ink hover:text-primary"
            >
              <PersonAvatar name={p?.name ?? "Unknown"} id={row.original.patientId} size="xs" initials={p?.initials} />
              <span className="whitespace-nowrap">{p?.name ?? row.original.patientId}</span>
            </Link>
          );
        },
      },
      { accessorKey: "type", header: "Type" },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => <StatusChip meta={priorityMeta[row.original.priority]} />,
      },
      {
        accessorKey: "dueDate",
        header: "Due",
        cell: ({ row }) => {
          const overdue = row.original.status === "overdue";
          return (
            <span className={cn("whitespace-nowrap tabular-nums", overdue ? "font-medium text-danger" : "text-ink")}>
              {relativeDay(row.original.dueDate)}
            </span>
          );
        },
      },
      {
        id: "owner",
        header: "Owner",
        accessorFn: (f) => staffById(f.ownerId)?.name ?? "",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusChip meta={followUpStatus[row.original.status]} />,
      },
      {
        accessorKey: "note",
        header: "Note",
        enableSorting: false,
        cell: ({ row }) => <span className="line-clamp-1 max-w-80 text-ink-3">{row.original.note}</span>,
      },
      {
        id: "actions",
        header: "",
        size: 96,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.status !== "completed" ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={(e) => {
                e.stopPropagation();
                toast("Follow-up completed", { description: `${row.original.id} marked done.` });
              }}
            >
              <CheckCircle2 className="size-3.5" strokeWidth={2} />
              Complete
            </Button>
          ) : null,
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Follow-ups"
        description="The care and outreach the hospital owes patients. Overdue items are called out in red."
        actions={
          <Button size="sm" asChild>
            <Link href="/follow-ups?create=1">
              <Plus className="size-3.5" strokeWidth={2.5} />
              New follow-up
            </Link>
          </Button>
        }
      >
        <div role="tablist" aria-label="Views" className="flex flex-wrap items-center gap-1 border-b border-line pb-2">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-body-sm transition-colors cursor-pointer",
                view === v.id ? "bg-primary-soft font-medium text-primary-soft-fg" : "text-ink-3 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {v.label}
              {v.id === "overdue" && counts.overdue > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-solid px-1 text-[0.625rem] font-semibold text-white tabular-nums">
                  {counts.overdue}
                </span>
              )}
            </button>
          ))}
        </div>
      </PageHeader>

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(f) => f.id}
        pageSize={12}
        minWidth="76rem"
        empty={{
          icon: Timer,
          title: view === "overdue" ? "Nothing overdue" : "No follow-ups here",
          description:
            view === "overdue"
              ? "Every follow-up is on track. Nice."
              : "Nothing in this view. Create a follow-up to keep a patient relationship warm.",
        }}
        bulkActions={(selected, clear) => (
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => {
              toast(`${selected.length} follow-ups completed`);
              clear();
            }}
          >
            <CheckCircle2 className="size-3.5" strokeWidth={2} />
            Mark complete
          </Button>
        )}
        toolbar={() => (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" strokeWidth={2} />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Patient, type, or note" aria-label="Search follow-ups" className="h-8 pl-8" />
            </div>
          </div>
        )}
      />

      <NewFollowUpDialog />
    </div>
  );
}

function NewFollowUpDialog() {
  const patients = useCareflow((s) => s.patients);
  const logAudit = useCareflow((s) => s.logAudit);
  const [patient, setPatient] = useState("");

  return (
    <ParamDialog
      title="New follow-up"
      description="Schedule outreach for a patient. In this demo it is not persisted."
      submitLabel="Create"
      onSubmit={() => {
        logAudit({
          action: "created",
          resource: "Follow-up",
          resourceId: "FU-new",
          field: "patient",
          previousValue: null,
          newValue: patient || "unassigned",
        });
        toast("Follow-up created");
      }}
    >
      <Field label="Patient" htmlFor="fu-patient">
        <Select value={patient} onValueChange={setPatient}>
          <SelectTrigger id="fu-patient" className="w-full">
            <SelectValue placeholder="Select a patient" />
          </SelectTrigger>
          <SelectContent>
            {patients.slice(0, 30).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" htmlFor="fu-type">
          <Select defaultValue="Post consultation">
            <SelectTrigger id="fu-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Post consultation", "Post procedure", "Missed appointment", "Lab result", "Medication reminder", "Annual checkup", "Chronic care", "Referral follow-up"].map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Owner" htmlFor="fu-owner">
          <Select defaultValue="u-002">
            <SelectTrigger id="fu-owner" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {staff.filter((s) => s.status === "active").map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Note" htmlFor="fu-note">
        <Textarea id="fu-note" rows={2} placeholder="What needs to happen, and why" />
      </Field>
    </ParamDialog>
  );
}
