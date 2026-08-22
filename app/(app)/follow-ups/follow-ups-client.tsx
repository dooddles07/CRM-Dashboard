"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Plus, RotateCcw, Search, Timer } from "lucide-react";
import { toast } from "sonner";
import type { FollowUpDTO } from "@/lib/server/services/followups";
import { completeFollowUp, rescheduleFollowUp } from "@/app/actions/pipeline";
import { followUpStatus, priorityMeta } from "@/lib/status";
import { daysFromToday, relativeDay } from "@/lib/format";
import { PageHeader } from "@/components/data/page-header";
import { DataTable, selectionColumn } from "@/components/data/data-table";
import { StatusChip } from "@/components/healthcare/status-chip";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { ParamDialog, Field } from "@/components/shared/create-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface PersonOption {
  reference: string;
  name: string;
}

interface FollowUpsClientProps {
  rows: FollowUpDTO[];
  total: number;
  patients: PersonOption[];
  owners: PersonOption[];
}

export function FollowUpsClient({ rows, total, patients, owners }: FollowUpsClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<ViewId>("all");
  const [search, setSearch] = useState("");
  const [rescheduleTarget, setRescheduleTarget] = useState<FollowUpDTO | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((f) => {
      const delta = daysFromToday(f.dueDate);
      if (view === "overdue" && f.status !== "overdue") return false;
      if (view === "today" && delta !== 0) return false;
      if (view === "upcoming" && (delta <= 0 || f.status === "completed")) return false;
      if (view === "completed" && f.status !== "completed") return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !f.patient.name.toLowerCase().includes(q) &&
          !f.type.toLowerCase().includes(q) &&
          !(f.note ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [rows, view, search]);

  const counts = {
    overdue: rows.filter((f) => f.status === "overdue").length,
  };

  const complete = useCallback(
    (reference: string) => {
      startTransition(async () => {
        const result = await completeFollowUp(reference, null);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        toast("Follow-up completed", { description: `${reference} marked done.` });
        router.refresh();
      });
    },
    [router],
  );

  const reschedule = () => {
    if (!rescheduleTarget || !rescheduleDate) return;
    startTransition(async () => {
      const result = await rescheduleFollowUp(rescheduleTarget.reference, rescheduleDate);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast("Follow-up rescheduled", { description: `${rescheduleTarget.reference} · ${rescheduleDate}` });
      setRescheduleTarget(null);
      router.refresh();
    });
  };

  const columns = useMemo<ColumnDef<FollowUpDTO, unknown>[]>(
    () => [
      selectionColumn<FollowUpDTO>("follow-ups"),
      {
        id: "patient",
        header: "Patient",
        accessorFn: (f) => f.patient.name,
        cell: ({ row }) => (
          <Link
            href={`/patients/${row.original.patient.reference}?tab=follow-ups`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 font-medium text-ink hover:text-primary"
          >
            <PersonAvatar name={row.original.patient.name} id={row.original.patient.reference} size="xs" />
            <span className="whitespace-nowrap">{row.original.patient.name}</span>
          </Link>
        ),
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
        accessorFn: (f) => f.owner?.name ?? "",
        cell: ({ row }) => <span className="text-ink-2">{row.original.owner?.name ?? "—"}</span>,
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
        cell: ({ row }) => <span className="line-clamp-1 max-w-80 text-ink-3">{row.original.note ?? "—"}</span>,
      },
      {
        id: "actions",
        header: "",
        size: 160,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.status !== "completed" ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                disabled={pending}
                onClick={() => {
                  setRescheduleTarget(row.original);
                  setRescheduleDate(row.original.dueDate);
                }}
              >
                <RotateCcw className="size-3.5" strokeWidth={2} />
                Reschedule
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                disabled={pending}
                onClick={() => complete(row.original.reference)}
              >
                <CheckCircle2 className="size-3.5" strokeWidth={2} />
                Complete
              </Button>
            </div>
          ) : null,
      },
    ],
    [pending, complete],
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
        getRowId={(f) => f.reference}
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
        toolbar={() => (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" strokeWidth={2} />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Patient, type, or note" aria-label="Search follow-ups" className="h-8 pl-8" />
            </div>
          </div>
        )}
      />

      <p className="mt-2 text-caption text-ink-3">{total} follow-up{total === 1 ? "" : "s"} total.</p>

      <Dialog open={rescheduleTarget !== null} onOpenChange={(open) => !open && setRescheduleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule {rescheduleTarget?.reference}</DialogTitle>
            <DialogDescription>Pick a new due date for {rescheduleTarget?.patient.name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label htmlFor="fu-reschedule-date">New due date</Label>
            <Input
              id="fu-reschedule-date"
              type="date"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRescheduleTarget(null)} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" onClick={reschedule} disabled={pending || !rescheduleDate}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewFollowUpDialog patients={patients} owners={owners} />
    </div>
  );
}

function NewFollowUpDialog({ patients, owners }: { patients: PersonOption[]; owners: PersonOption[] }) {
  const [patient, setPatient] = useState("");

  return (
    <ParamDialog
      title="New follow-up"
      description="Schedule outreach for a patient. In this demo it is not persisted."
      submitLabel="Create"
      onSubmit={() => {
        toast("Follow-up created", { description: patient || "unassigned" });
      }}
    >
      <Field label="Patient" htmlFor="fu-patient">
        <Select value={patient} onValueChange={setPatient}>
          <SelectTrigger id="fu-patient" className="w-full">
            <SelectValue placeholder="Select a patient" />
          </SelectTrigger>
          <SelectContent>
            {patients.map((p) => (
              <SelectItem key={p.reference} value={p.reference}>
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
          <Select>
            <SelectTrigger id="fu-owner" className="w-full">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {owners.map((o) => (
                <SelectItem key={o.reference} value={o.reference}>
                  {o.name}
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
