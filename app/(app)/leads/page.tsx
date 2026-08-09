"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Columns3,
  Plus,
  Search,
  Table as TableIcon,
  Waypoints,
} from "lucide-react";
import { toast } from "sonner";
import type { Lead } from "@/lib/types";
import { leads } from "@/lib/data/pipeline";
import { staffById, staff } from "@/lib/data/people";
import { departmentName, departments, sourceLabels } from "@/lib/data/constants";
import { leadStage, priorityMeta } from "@/lib/status";
import { formatCurrency, relativeDay } from "@/lib/format";
import { useCareflow } from "@/lib/store";
import { PageHeader } from "@/components/data/page-header";
import { DataTable, selectionColumn } from "@/components/data/data-table";
import { StatusChip } from "@/components/healthcare/status-chip";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
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
import { cn } from "@/lib/utils";

// dnd-kit generates aria ids that differ between server and client, so the board
// is rendered on the client only to avoid a hydration mismatch.
const LeadBoard = dynamic(
  () => import("@/components/pipeline/lead-board").then((m) => m.LeadBoard),
  {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse rounded-lg border border-line bg-surface-2/50" />,
  },
);

export default function LeadsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"board" | "table">("board");
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("all");

  const openLeads = leads.filter((l) => l.stage !== "converted");
  const converted = leads.filter((l) => l.stage === "converted").length;
  const pipelineValue = openLeads.reduce((s, l) => s + l.value, 0);
  const conversionRate = Math.round((converted / leads.length) * 100);

  const kpis = [
    { label: "Open leads", value: `${openLeads.length}`, sub: "in the pipeline" },
    { label: "Pipeline value", value: formatCurrency(pipelineValue), sub: "open opportunities" },
    { label: "Conversion", value: `${conversionRate}%`, sub: "lead to patient" },
    { label: "Converted", value: `${converted}`, sub: "this quarter" },
  ];

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (owner !== "all" && l.ownerId !== owner) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !l.name.toLowerCase().includes(q) &&
          !l.interest.toLowerCase().includes(q) &&
          !l.id.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [owner, search]);

  const columns = useMemo<ColumnDef<Lead, unknown>[]>(
    () => [
      selectionColumn<Lead>("leads"),
      {
        accessorKey: "name",
        header: "Lead",
        cell: ({ row }) => (
          <Link
            href={`/leads/${row.original.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 font-medium text-ink hover:text-primary"
          >
            <PersonAvatar name={row.original.name} id={row.original.id} size="xs" initials={row.original.initials} />
            <span className="whitespace-nowrap">{row.original.name}</span>
          </Link>
        ),
      },
      {
        id: "interest",
        header: "Interest",
        accessorFn: (l) => l.interest,
        cell: ({ row }) => <span className="whitespace-nowrap text-ink-2">{row.original.interest}</span>,
      },
      {
        id: "source",
        header: "Source",
        accessorFn: (l) => sourceLabels[l.source],
      },
      {
        id: "department",
        header: "Department",
        accessorFn: (l) => departmentName(l.departmentId),
      },
      {
        accessorKey: "stage",
        header: "Stage",
        cell: ({ row }) => <StatusChip meta={leadStage[row.original.stage]} />,
      },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => <StatusChip meta={priorityMeta[row.original.priority]} />,
      },
      {
        accessorKey: "value",
        header: "Value",
        cell: ({ row }) => (
          <span className="font-medium text-ink tabular-nums">{formatCurrency(row.original.value)}</span>
        ),
      },
      {
        id: "owner",
        header: "Owner",
        accessorFn: (l) => staffById(l.ownerId)?.name ?? "",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-ink-2">{staffById(row.original.ownerId)?.name ?? "—"}</span>
        ),
      },
      {
        accessorKey: "nextFollowUp",
        header: "Next follow-up",
        cell: ({ row }) =>
          row.original.nextFollowUp ? (
            <span className="whitespace-nowrap">{relativeDay(row.original.nextFollowUp)}</span>
          ) : (
            <span className="text-ink-3">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Leads"
        description="Inbound enquiries moving toward becoming patients. Drag a card to advance its stage."
        actions={
          <>
            <div
              role="group"
              aria-label="View"
              className="flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5"
            >
              <button
                type="button"
                aria-pressed={tab === "board"}
                onClick={() => setTab("board")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-body-sm transition-colors cursor-pointer",
                  tab === "board" ? "bg-primary-soft font-medium text-primary-soft-fg" : "text-ink-3 hover:text-ink",
                )}
              >
                <Columns3 className="size-3.5" strokeWidth={2} />
                Board
              </button>
              <button
                type="button"
                aria-pressed={tab === "table"}
                onClick={() => setTab("table")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-body-sm transition-colors cursor-pointer",
                  tab === "table" ? "bg-primary-soft font-medium text-primary-soft-fg" : "text-ink-3 hover:text-ink",
                )}
              >
                <TableIcon className="size-3.5" strokeWidth={2} />
                Table
              </button>
            </div>
            <Button size="sm" asChild>
              <Link href="/leads?create=1">
                <Plus className="size-3.5" strokeWidth={2.5} />
                New lead
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-line bg-surface p-3 shadow-card">
            <p className="text-label text-ink-3">{k.label}</p>
            <p className="mt-1.5 text-[1.5rem] font-semibold leading-7 text-ink tabular-nums">{k.value}</p>
            <p className="mt-0.5 text-caption text-ink-3">{k.sub}</p>
          </div>
        ))}
      </div>

      {tab === "board" ? (
        <LeadBoard leads={leads} />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(l) => l.id}
          onRowClick={(l) => router.push(`/leads/${l.id}`)}
          pageSize={12}
          minWidth="76rem"
          empty={{
            icon: Waypoints,
            title: "No leads match",
            description: "Adjust the search or owner filter to see more of the pipeline.",
          }}
          toolbar={() => (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" strokeWidth={2} />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, interest, or ID" aria-label="Search leads" className="h-8 pl-8" />
              </div>
              <Select value={owner} onValueChange={setOwner}>
                <SelectTrigger size="sm" className="w-auto min-w-36" aria-label="Owner">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All owners</SelectItem>
                  {staff.filter((s) => ["Marketing", "Patient Relations"].includes(s.role)).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        />
      )}

      <NewLeadDialog />
    </div>
  );
}

function NewLeadDialog() {
  const logAudit = useCareflow((s) => s.logAudit);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");

  return (
    <ParamDialog
      title="New lead"
      description="Capture an inbound enquiry. In this demo the lead is not persisted."
      submitLabel="Create lead"
      onSubmit={() => {
        if (!name.trim()) {
          toast("Add a name first");
          return false;
        }
        logAudit({
          action: "created",
          resource: "Lead",
          resourceId: "LD-new",
          field: "name",
          previousValue: null,
          newValue: name,
        });
        toast("Lead created", { description: `${name} added to the pipeline as New.` });
      }}
    >
      <Field label="Name" htmlFor="ld-name">
        <Input id="ld-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Department" htmlFor="ld-dept">
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger id="ld-dept" className="w-full">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Source" htmlFor="ld-source">
          <Select defaultValue="website">
            <SelectTrigger id="ld-source" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(sourceLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Interest" htmlFor="ld-interest">
        <Input id="ld-interest" placeholder="What are they asking about?" />
      </Field>
    </ParamDialog>
  );
}
