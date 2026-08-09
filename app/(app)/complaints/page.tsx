"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MessageSquareWarning, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { Complaint } from "@/lib/types";
import { complaints } from "@/lib/data/experience";
import { patientById, staffById } from "@/lib/data/people";
import { departmentName } from "@/lib/data/constants";
import { caseStatus, priorityMeta } from "@/lib/status";
import { daysFromToday, relativeDay } from "@/lib/format";
import { useCareflow } from "@/lib/store";
import { PageHeader } from "@/components/data/page-header";
import { DataTable } from "@/components/data/data-table";
import { StatusChip } from "@/components/healthcare/status-chip";
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

const OPEN_STATUSES: Complaint["status"][] = ["new", "assigned", "investigating", "waiting"];

export function isBreached(c: Complaint): boolean {
  return OPEN_STATUSES.includes(c.status) && daysFromToday(c.slaDueAt) < 0;
}

export default function ComplaintsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const open = complaints.filter((c) => OPEN_STATUSES.includes(c.status)).length;
  const breached = complaints.filter(isBreached).length;

  const filtered = useMemo(() => {
    return complaints
      .filter((c) => {
        if (status === "open" && !OPEN_STATUSES.includes(c.status)) return false;
        if (status === "breached" && !isBreached(c)) return false;
        if (status !== "all" && status !== "open" && status !== "breached" && c.status !== status) return false;
        if (search) {
          const q = search.toLowerCase();
          const patient = patientById(c.patientId);
          if (!c.subject.toLowerCase().includes(q) && !patient?.name.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q))
            return false;
        }
        return true;
      })
      .sort((a, b) => (a.slaDueAt < b.slaDueAt ? -1 : 1));
  }, [status, search]);

  const columns = useMemo<ColumnDef<Complaint, unknown>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Case",
        cell: ({ row }) => <span className="text-ident text-ink-3">{row.original.id}</span>,
      },
      {
        id: "patient",
        header: "Patient",
        accessorFn: (c) => patientById(c.patientId)?.name ?? c.patientId,
      },
      {
        accessorKey: "subject",
        header: "Subject",
        cell: ({ row }) => (
          <div className="min-w-0 max-w-80">
            <p className="truncate font-medium text-ink">{row.original.subject}</p>
            <p className="text-caption text-ink-3">{row.original.type} · {departmentName(row.original.departmentId)}</p>
          </div>
        ),
      },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => <StatusChip meta={priorityMeta[row.original.priority]} />,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusChip meta={caseStatus[row.original.status]} />,
      },
      {
        id: "sla",
        header: "SLA",
        accessorFn: (c) => c.slaDueAt,
        cell: ({ row }) => {
          const c = row.original;
          if (!OPEN_STATUSES.includes(c.status)) {
            return <span className="text-caption text-success">Met</span>;
          }
          const delta = daysFromToday(c.slaDueAt);
          return (
            <span
              className={cn(
                "whitespace-nowrap text-body-sm tabular-nums",
                delta < 0 ? "font-medium text-danger" : delta === 0 ? "text-warning" : "text-ink-2",
              )}
            >
              {delta < 0 ? `Breached ${relativeDay(c.slaDueAt)}` : `Due ${relativeDay(c.slaDueAt)}`}
            </span>
          );
        },
      },
      {
        id: "owner",
        header: "Owner",
        accessorFn: (c) => staffById(c.ownerId)?.name ?? "",
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Complaints"
        description="Patient complaints tracked as cases against a resolution SLA. Breaches are flagged in red."
        actions={
          <Button size="sm" asChild>
            <Link href="/complaints?create=1">
              <Plus className="size-3.5" strokeWidth={2.5} />
              Log complaint
            </Link>
          </Button>
        }
      />

      {breached > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2.5 text-body-sm text-danger">
          <MessageSquareWarning className="size-4 shrink-0" strokeWidth={2} />
          <span>
            <span className="font-medium">{breached} {breached === 1 ? "case has" : "cases have"} breached SLA.</span>{" "}
            {open} open in total.
          </span>
        </div>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(c) => c.id}
        onRowClick={(c) => router.push(`/complaints/${c.id}`)}
        pageSize={12}
        minWidth="76rem"
        empty={{
          icon: MessageSquareWarning,
          title: "No complaints match",
          description: "Adjust the filters. An empty list here is a good thing.",
        }}
        toolbar={() => (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" strokeWidth={2} />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Case, patient, or subject" aria-label="Search complaints" className="h-8 pl-8" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger size="sm" className="w-auto min-w-32" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cases</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="breached">Breached SLA</SelectItem>
                {Object.entries(caseStatus).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      />

      <LogComplaintDialog />
    </div>
  );
}

function LogComplaintDialog() {
  const patients = useCareflow((s) => s.patients);
  const logAudit = useCareflow((s) => s.logAudit);
  const [subject, setSubject] = useState("");

  return (
    <ParamDialog
      title="Log complaint"
      description="Open a case. In this demo it is not persisted."
      submitLabel="Open case"
      onSubmit={() => {
        if (!subject.trim()) {
          toast("Add a subject first");
          return false;
        }
        logAudit({
          action: "created",
          resource: "Complaint",
          resourceId: "CS-new",
          field: "subject",
          previousValue: null,
          newValue: subject,
        });
        toast("Case opened", { description: "SLA clock started. Assigned to the department queue." });
      }}
    >
      <Field label="Subject" htmlFor="cs-subject">
        <Input id="cs-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary of the complaint" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Patient" htmlFor="cs-patient">
          <Select>
            <SelectTrigger id="cs-patient" className="w-full">
              <SelectValue placeholder="Select" />
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
        <Field label="Type" htmlFor="cs-type">
          <Select defaultValue="Care quality">
            <SelectTrigger id="cs-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Wait time", "Billing", "Staff conduct", "Facilities", "Care quality"].map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Details" htmlFor="cs-details">
        <Textarea id="cs-details" rows={3} placeholder="What happened, in the patient's words where possible" />
      </Field>
    </ParamDialog>
  );
}
