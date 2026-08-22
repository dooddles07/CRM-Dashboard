"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MessageSquareWarning, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { ComplaintDTO } from "@/lib/server/services/complaints";
import { caseStatus, priorityMeta } from "@/lib/status";
import { relativeDay } from "@/lib/format";
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

interface DepartmentOption {
  id: string;
  name: string;
}

interface OwnerOption {
  reference: string;
  name: string;
}

interface ComplaintsClientProps {
  rows: ComplaintDTO[];
  total: number;
  summary: { open: number; breached: number; byStatus: Record<string, number> };
  departments: DepartmentOption[];
  owners: OwnerOption[];
}

export function ComplaintsClient({ rows, total, summary, departments, owners }: ComplaintsClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [departmentId, setDepartmentId] = useState("all");

  const filtered = useMemo(() => {
    return rows
      .filter((c) => {
        if (status === "breached" && !c.breached) return false;
        if (status !== "all" && status !== "breached" && c.status !== status) return false;
        if (priority !== "all" && c.priority !== priority) return false;
        if (departmentId !== "all" && c.department?.id !== departmentId) return false;
        if (search) {
          const q = search.toLowerCase();
          if (
            !c.subject.toLowerCase().includes(q) &&
            !c.patient.name.toLowerCase().includes(q) &&
            !c.reference.toLowerCase().includes(q)
          )
            return false;
        }
        return true;
      })
      .sort((a, b) => (a.slaDueAt < b.slaDueAt ? -1 : 1));
  }, [rows, status, priority, departmentId, search]);

  const columns = useMemo<ColumnDef<ComplaintDTO, unknown>[]>(
    () => [
      {
        accessorKey: "reference",
        header: "Case",
        cell: ({ row }) => <span className="text-ident text-ink-3">{row.original.reference}</span>,
      },
      {
        id: "patient",
        header: "Patient",
        accessorFn: (c) => c.patient.name,
      },
      {
        accessorKey: "subject",
        header: "Subject",
        cell: ({ row }) => (
          <div className="min-w-0 max-w-80">
            <p className="truncate font-medium text-ink">{row.original.subject}</p>
            <p className="text-caption text-ink-3">
              {row.original.type} · {row.original.department?.name ?? "Unassigned"}
            </p>
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
          if (c.resolvedAt) {
            return <span className="text-caption text-success">Met</span>;
          }
          return (
            <span
              className={cn(
                "whitespace-nowrap text-body-sm tabular-nums",
                c.breached ? "font-medium text-danger" : c.hoursToBreach !== null && c.hoursToBreach <= 24 ? "text-warning" : "text-ink-2",
              )}
            >
              {c.breached ? `Breached ${relativeDay(c.slaDueAt)}` : `Due ${relativeDay(c.slaDueAt)}`}
            </span>
          );
        },
      },
      {
        id: "owner",
        header: "Owner",
        accessorFn: (c) => c.owner?.name ?? "",
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

      {summary.breached > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2.5 text-body-sm text-danger">
          <MessageSquareWarning className="size-4 shrink-0" strokeWidth={2} />
          <span>
            <span className="font-medium">
              {summary.breached} {summary.breached === 1 ? "case has" : "cases have"} breached SLA.
            </span>{" "}
            {summary.open} open in total.
          </span>
        </div>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(c) => c.reference}
        onRowClick={(c) => router.push(`/complaints/${c.reference}`)}
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
                <SelectItem value="breached">Breached SLA</SelectItem>
                {Object.entries(caseStatus).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger size="sm" className="w-auto min-w-28" aria-label="Priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {Object.entries(priorityMeta).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger size="sm" className="w-auto min-w-36" aria-label="Department">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      />

      <LogComplaintDialog owners={owners} />
      <p className="mt-2 text-caption text-ink-3">{total} case{total === 1 ? "" : "s"} total.</p>
    </div>
  );
}

/** Not yet persisted — logging a new complaint is out of scope for this ticket. */
function LogComplaintDialog({ owners }: { owners: OwnerOption[] }) {
  const patients = useCareflow((s) => s.patients);
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
      <Field label="Owner" htmlFor="cs-owner">
        <Select>
          <SelectTrigger id="cs-owner" className="w-full">
            <SelectValue placeholder="Department queue" />
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
      <Field label="Details" htmlFor="cs-details">
        <Textarea id="cs-details" rows={3} placeholder="What happened, in the patient's words where possible" />
      </Field>
    </ParamDialog>
  );
}
