"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CalendarPlus,
  Download,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Tag,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { PatientListDTO } from "@/lib/server/services/patients";
import { patientStatus } from "@/lib/status";
import { useViewer } from "@/components/shell/viewer-context";
import { recordPatientExport } from "@/app/actions/patients";
import { formatDateShort, relativeDay } from "@/lib/format";
import { PageHeader } from "@/components/data/page-header";
import { DataTable, selectionColumn } from "@/components/data/data-table";
import { StatusChip } from "@/components/healthcare/status-chip";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { Protected } from "@/components/healthcare/protected";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const savedViews = [
  { id: "all", label: "All patients" },
  { id: "new", label: "New this month" },
  { id: "follow-up", label: "Needs follow-up" },
  { id: "vip", label: "VIP" },
  { id: "inactive", label: "Lapsed" },
] as const;

type ViewId = (typeof savedViews)[number]["id"];

interface PatientsClientProps {
  /** One page of rows, already scoped, filtered and masked by the server. */
  rows: PatientListDTO[];
  total: number;
  /** Reference data for the filter pickers, resolved by the shell. */
  departments: { id: string; name: string }[];
  doctors: { reference: string; name: string }[];
}

/**
 * plan/06-screen-migration.md §1 step 2: "The body does not change. Only its
 * inputs." The table, filters and layout are the code that shipped against
 * seed arrays; what changed is where the rows come from, and that contact
 * details now arrive masked with the plaintext never in the bundle.
 *
 * Filters remain client-side here on purpose. plan §2 draws the line at
 * dataset size — sorting 24 rows in the browser is right, filtering 18,000 is
 * not — and the seed has 24. The server-side equivalents already exist on
 * `patients.list`, so moving them to the URL is a change of caller, not new
 * work, once the volume justifies it.
 */
export function PatientsClient({ rows, total, departments, doctors }: PatientsClientProps) {
  // Courtesy only: revealAction checks the same capability server-side.
  const canReveal = useViewer().permissions.capabilities.includes("reveal");
  const router = useRouter();
  const patients = rows;

  const [view, setView] = useState<ViewId>("all");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [doctor, setDoctor] = useState("all");
  const [status, setStatus] = useState("all");
  const [insurance, setInsurance] = useState("all");

  const filtered = useMemo(() => {
    return patients.filter((p) => {
      if (view === "new" && p.status !== "new") return false;
      if (view === "follow-up" && p.outstandingFollowUps === 0) return false;
      if (view === "vip" && !p.tags.includes("VIP")) return false;
      if (view === "inactive" && p.status !== "inactive") return false;
      if (department !== "all" && p.department?.id !== department) return false;
      if (doctor !== "all" && p.doctor?.reference !== doctor) return false;
      if (status !== "all" && p.status !== status) return false;
      if (insurance === "insured" && !p.insurance) return false;
      if (insurance === "uninsured" && p.insurance) return false;
      if (search) {
        const q = search.toLowerCase();
        const hit =
          p.name.toLowerCase().includes(q) ||
          p.reference.toLowerCase().includes(q) ||
          (p.department?.name ?? "").toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [patients, view, department, doctor, status, insurance, search]);

  const activeFilters =
    (department !== "all" ? 1 : 0) +
    (doctor !== "all" ? 1 : 0) +
    (status !== "all" ? 1 : 0) +
    (insurance !== "all" ? 1 : 0);

  function clearFilters() {
    setDepartment("all");
    setDoctor("all");
    setStatus("all");
    setInsurance("all");
    setSearch("");
    setView("all");
  }

  const columns = useMemo<ColumnDef<PatientListDTO, unknown>[]>(
    () => [
      selectionColumn<PatientListDTO>("patients"),
      {
        accessorKey: "id",
        header: "Patient ID",
        cell: ({ row }) => (
          <span className="text-ident text-ink-3">{row.original.reference}</span>
        ),
      },
      {
        accessorKey: "name",
        header: "Patient",
        cell: ({ row }) => (
          <Link
            href={`/patients/${row.original.reference}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 font-medium text-ink hover:text-primary"
          >
            <PersonAvatar
              name={row.original.name}
              id={row.original.reference}
              size="xs"
              initials={row.original.initials}
            />
            <span className="whitespace-nowrap">{row.original.name}</span>
          </Link>
        ),
      },
      {
        id: "contact",
        header: "Contact",
        enableSorting: false,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Protected
              masked={row.original.phone.masked}
              revealable={row.original.phone.revealable && canReveal}
              resource="patient"
              resourceId={row.original.reference}
              field="phone" label="Mobile number"
            />
          </div>
        ),
      },
      {
        accessorKey: "age",
        header: "Age",
        cell: ({ row }) => <span className="tabular-nums">{row.original.age}</span>,
      },
      {
        accessorKey: "gender",
        header: "Gender",
      },
      {
        id: "department",
        header: "Department",
        accessorFn: (p) => (p.department?.name ?? ""),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {row.original.department?.name ?? "Unassigned"}
          </span>
        ),
      },
      {
        id: "doctor",
        header: "Assigned doctor",
        accessorFn: (p) => p.doctor?.name ?? "",
        cell: ({ row }) => (
          <Link
            href={`/doctors/${row.original.doctor?.reference ?? ""}`}
            onClick={(e) => e.stopPropagation()}
            className="whitespace-nowrap hover:text-primary"
          >
            {row.original.doctor?.name ?? "Unassigned"}
          </Link>
        ),
      },
      {
        accessorKey: "lastVisit",
        header: "Last visit",
        cell: ({ row }) =>
          row.original.lastVisit ? (
            <span className="whitespace-nowrap">
              {formatDateShort(row.original.lastVisit)}
            </span>
          ) : (
            <span className="text-ink-3">Never</span>
          ),
      },
      {
        accessorKey: "nextAppointment",
        header: "Next appointment",
        cell: ({ row }) =>
          row.original.nextAppointment ? (
            <span className="whitespace-nowrap text-ink">
              {relativeDay(row.original.nextAppointment)}
            </span>
          ) : (
            <span className="text-ink-3">None booked</span>
          ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusChip meta={patientStatus[row.original.status]} />,
      },
      {
        id: "tags",
        header: "Tags",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.tags.length === 0 ? (
            <span className="text-ink-3">—</span>
          ) : (
            <div className="flex max-w-56 flex-wrap gap-1">
              {row.original.tags.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className="whitespace-nowrap rounded-sm border border-line bg-surface-2 px-1.5 py-px text-caption text-ink-2"
                >
                  {t}
                </span>
              ))}
              {row.original.tags.length > 2 && (
                <span className="text-caption text-ink-3">
                  +{row.original.tags.length - 2}
                </span>
              )}
            </div>
          ),
      },
      {
        id: "actions",
        header: "",
        size: 44,
        enableSorting: false,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Actions for ${row.original.name}`}
                >
                  <MoreHorizontal className="size-4" strokeWidth={2} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href={`/patients/${row.original.reference}`}>Open patient</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/appointments?create=1">Book appointment</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/inbox?compose=1">Send message</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/follow-ups?create=1">Create follow-up</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() =>
                    toast("Archive patient", {
                      description: `${row.original.name} would move to archived. Confirmation runs on the patient record.`,
                    })
                  }
                >
                  Archive patient
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    // `canReveal` is read inside the contact column, so the columns must be
    // rebuilt when it changes — otherwise a session that gained or lost the
    // capability would keep rendering the wrong affordance.
    [canReveal],
  );

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Patients"
        description={
          // `total` is the server's count under this caller's row-level
          // scope, which is not the same number for everyone: a Nurse sees
          // their department's patients and this says so honestly rather than
          // implying it is the hospital's whole roster.
          filtered.length === total
            ? `${total} patient${total === 1 ? "" : "s"} you can see, with contact details masked until someone needs them.`
            : `${filtered.length} of ${total} shown, with contact details masked until someone needs them.`
        }
        actions={
          <>
            <Button variant="outline" size="sm">
              <Upload className="size-3.5" strokeWidth={2} />
              Import
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // The audit entry is written server-side now. The old
                // client-side logAudit wrote to a browser store, which
                // recorded a bulk disclosure nowhere durable.
                void recordPatientExport(`view=${view}`, filtered.length).then((result) => {
                  if (!result.ok) {
                    toast.error(result.message);
                    return;
                  }
                  toast("Export queued", {
                    description: `${filtered.length} records · contact details masked · recorded in the audit log.`,
                  });
                });
              }}
            >
              <Download className="size-3.5" strokeWidth={2} />
              Export
            </Button>
            <Button size="sm" asChild>
              <Link href="/patients/new">
                <Plus className="size-3.5" strokeWidth={2.5} />
                Add patient
              </Link>
            </Button>
          </>
        }
      >
        <div
          role="tablist"
          aria-label="Saved views"
          className="flex flex-wrap items-center gap-1 border-b border-line pb-2"
        >
          {savedViews.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-body-sm transition-colors duration-150 cursor-pointer",
                view === v.id
                  ? "bg-primary-soft font-medium text-primary-soft-fg"
                  : "text-ink-3 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </PageHeader>

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(p) => p.reference}
        onRowClick={(p) => router.push(`/patients/${p.reference}`)}
        pageSize={12}
        minWidth="84rem"
        empty={{
          icon: Users,
          title: "No patients match these filters",
          description:
            activeFilters > 0 || search
              ? "Try a wider date range, or clear the filters to see every record."
              : "Add the first patient to start building the relationship record.",
          action:
            activeFilters > 0 || search ? (
              <Button size="sm" variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link href="/patients/new">
                  <UserPlus className="size-3.5" strokeWidth={2.25} />
                  Add patient
                </Link>
              </Button>
            ),
        }}
        bulkActions={(selected, clear) => (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => {
                toast(`Message queued for ${selected.length} patients`, {
                  description: "Each patient receives it on their preferred channel.",
                });
                clear();
              }}
            >
              <Send className="size-3.5" strokeWidth={2} />
              Send message
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => {
                toast(`Tag added to ${selected.length} patients`);
                clear();
              }}
            >
              <Tag className="size-3.5" strokeWidth={2} />
              Add tag
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => {
                toast(`Follow-up created for ${selected.length} patients`);
                clear();
              }}
            >
              <CalendarPlus className="size-3.5" strokeWidth={2} />
              Create follow-up
            </Button>
          </>
        )}
        toolbar={() => (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3"
                strokeWidth={2}
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, patient ID, or tag"
                aria-label="Search patients"
                className="h-8 pl-8"
              />
            </div>

            <Select value={department} onValueChange={setDepartment}>
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

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger size="sm" className="w-auto min-w-28" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <SlidersHorizontal className="size-3.5" strokeWidth={2} />
                  More filters
                  {activeFilters > 0 && (
                    <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold text-primary-fg tabular-nums">
                      {activeFilters}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="f-doctor">Assigned doctor</Label>
                  <Select value={doctor} onValueChange={setDoctor}>
                    <SelectTrigger id="f-doctor" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any doctor</SelectItem>
                      {doctors.map((d) => (
                        <SelectItem key={d.reference} value={d.reference}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-insurance">Insurance</Label>
                  <Select value={insurance} onValueChange={setInsurance}>
                    <SelectTrigger id="f-insurance" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any</SelectItem>
                      <SelectItem value="insured">Insured</SelectItem>
                      <SelectItem value="uninsured">Self-paying</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={clearFilters}
                  disabled={activeFilters === 0 && !search && view === "all"}
                >
                  Clear all filters
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        )}
      />
    </div>
  );
}
