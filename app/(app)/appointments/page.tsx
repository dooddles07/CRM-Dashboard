"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CalendarCheck,
  CalendarRange,
  CalendarX,
  Download,
  MoreHorizontal,
  Plus,
  Search,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import type { Appointment } from "@/lib/types";
import { appointments } from "@/lib/data/scheduling";
import { patientById } from "@/lib/data/people";
import { doctorById } from "@/lib/data/people";
import { departmentName, departments } from "@/lib/data/constants";
import { appointmentStatus } from "@/lib/status";
import { formatDateShort, relativeDay, daysFromToday } from "@/lib/format";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const scopes = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
  { id: "all", label: "All" },
] as const;

type ScopeId = (typeof scopes)[number]["id"];

const statuses = [
  "requested",
  "pending",
  "confirmed",
  "checked-in",
  "in-consultation",
  "completed",
  "cancelled",
  "rescheduled",
  "no-show",
] as const;

export default function AppointmentsPage() {
  const router = useRouter();
  const logAudit = useCareflow((s) => s.logAudit);

  const [scope, setScope] = useState<ScopeId>("today");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    return appointments
      .filter((a) => {
        const delta = daysFromToday(a.date);
        if (scope === "today" && delta !== 0) return false;
        if (scope === "upcoming" && delta < 0) return false;
        if (scope === "past" && delta >= 0) return false;
        if (department !== "all" && a.departmentId !== department) return false;
        if (status !== "all" && a.status !== status) return false;
        if (search) {
          const q = search.toLowerCase();
          const patient = patientById(a.patientId);
          const doctor = doctorById(a.doctorId);
          const hit =
            a.id.toLowerCase().includes(q) ||
            patient?.name.toLowerCase().includes(q) ||
            doctor?.name.toLowerCase().includes(q) ||
            a.reason.toLowerCase().includes(q);
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) =>
        `${a.date}${a.start}` < `${b.date}${b.start}` ? -1 : 1,
      );
  }, [scope, department, status, search]);

  const activeFilters = (department !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0);

  const columns = useMemo<ColumnDef<Appointment, unknown>[]>(
    () => [
      selectionColumn<Appointment>("appointments"),
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => <span className="text-ident text-ink-3">{row.original.id}</span>,
      },
      {
        id: "patient",
        header: "Patient",
        accessorFn: (a) => patientById(a.patientId)?.name ?? a.patientId,
        cell: ({ row }) => {
          const p = patientById(row.original.patientId);
          return (
            <Link
              href={`/patients/${row.original.patientId}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 font-medium text-ink hover:text-primary"
            >
              <PersonAvatar
                name={p?.name ?? "Unknown"}
                id={row.original.patientId}
                size="xs"
                initials={p?.initials}
              />
              <span className="whitespace-nowrap">{p?.name ?? row.original.patientId}</span>
            </Link>
          );
        },
      },
      {
        id: "doctor",
        header: "Doctor",
        accessorFn: (a) => doctorById(a.doctorId)?.name ?? "",
        cell: ({ row }) => (
          <Link
            href={`/doctors/${row.original.doctorId}`}
            onClick={(e) => e.stopPropagation()}
            className="whitespace-nowrap hover:text-primary"
          >
            {doctorById(row.original.doctorId)?.name ?? "Unassigned"}
          </Link>
        ),
      },
      {
        id: "department",
        header: "Department",
        accessorFn: (a) => departmentName(a.departmentId),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{departmentName(row.original.departmentId)}</span>
        ),
      },
      { accessorKey: "type", header: "Type" },
      {
        accessorKey: "date",
        header: "When",
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <span className="text-ink">{formatDateShort(row.original.date)}</span>
            <span className="ml-1.5 text-ink-3 tabular-nums">{row.original.start}</span>
            <span className="ml-1.5 text-caption text-ink-3">
              {relativeDay(row.original.date)}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusChip meta={appointmentStatus[row.original.status]} />,
      },
      {
        id: "reminder",
        header: "Reminder",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.reminderChannel ? (
            <span className="text-caption text-ink-3 uppercase">
              {row.original.reminderChannel}
            </span>
          ) : (
            <span className="text-ink-3">—</span>
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
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.id}`}>
                  <MoreHorizontal className="size-4" strokeWidth={2} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href={`/appointments/${row.original.id}`}>Open appointment</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => toast("Reminder sent", { description: `${row.original.id} · patient notified on their preferred channel.` })}>
                  Send reminder
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => toast("Reschedule", { description: "Opens the scheduling drawer on the appointment." })}>
                  Reschedule
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => toast("Cancel appointment", { description: `${row.original.id} would be cancelled and the slot released.` })}
                >
                  Cancel appointment
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Appointments"
        description="Every booking across the hospital, from today's board to future and past visits."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/appointments/calendar">
                <CalendarRange className="size-3.5" strokeWidth={2} />
                Calendar
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                logAudit({
                  action: "exported",
                  resource: "Appointments",
                  resourceId: `scope:${scope}`,
                  field: `${filtered.length} records`,
                  previousValue: null,
                  newValue: null,
                });
                toast("Export queued", { description: `${filtered.length} appointments · recorded in the audit log.` });
              }}
            >
              <Download className="size-3.5" strokeWidth={2} />
              Export
            </Button>
            <Button size="sm" asChild>
              <Link href="/appointments?create=1">
                <Plus className="size-3.5" strokeWidth={2.5} />
                Book appointment
              </Link>
            </Button>
          </>
        }
      >
        <div role="tablist" aria-label="Scope" className="flex flex-wrap items-center gap-1 border-b border-line pb-2">
          {scopes.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={scope === s.id}
              onClick={() => setScope(s.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-body-sm transition-colors duration-150 cursor-pointer",
                scope === s.id
                  ? "bg-primary-soft font-medium text-primary-soft-fg"
                  : "text-ink-3 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </PageHeader>

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(a) => a.id}
        onRowClick={(a) => router.push(`/appointments/${a.id}`)}
        pageSize={12}
        minWidth="80rem"
        empty={{
          icon: CalendarX,
          title: "No appointments here",
          description:
            activeFilters > 0 || search
              ? "Nothing matches these filters. Widen the scope or clear them."
              : "Nothing booked in this window. Book an appointment to fill the board.",
          action: (
            <Button size="sm" asChild>
              <Link href="/appointments?create=1">
                <CalendarCheck className="size-3.5" strokeWidth={2.25} />
                Book appointment
              </Link>
            </Button>
          ),
        }}
        bulkActions={(selected, clear) => (
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => {
              toast(`Reminders sent to ${selected.length} patients`);
              clear();
            }}
          >
            <Send className="size-3.5" strokeWidth={2} />
            Send reminders
          </Button>
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
                placeholder="Patient, doctor, ID, or reason"
                aria-label="Search appointments"
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
              <SelectTrigger size="sm" className="w-auto min-w-32" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {appointmentStatus[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      />

      <BookAppointmentDialog />
    </div>
  );
}

function BookAppointmentDialog() {
  const logAudit = useCareflow((s) => s.logAudit);
  const patients = useCareflow((s) => s.patients);
  const [patient, setPatient] = useState("");
  const [type, setType] = useState("Consultation");

  return (
    <ParamDialog
      title="Book appointment"
      description="Create a booking. In this demo the slot is not persisted."
      submitLabel="Book"
      onSubmit={() => {
        logAudit({
          action: "created",
          resource: "Appointment",
          resourceId: "AP-new",
          field: type,
          previousValue: null,
          newValue: patient || "unassigned",
        });
        toast("Appointment booked", {
          description: "The patient will receive a reminder on their preferred channel.",
        });
      }}
    >
      <Field label="Patient" htmlFor="ap-patient">
        <Select value={patient} onValueChange={setPatient}>
          <SelectTrigger id="ap-patient" className="w-full">
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
        <Field label="Type" htmlFor="ap-type">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id="ap-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Consultation", "Follow-up", "Procedure", "Screening", "Vaccination", "Teleconsult"].map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="When" htmlFor="ap-when">
          <Input id="ap-when" type="datetime-local" className="h-9" />
        </Field>
      </div>
      <Field label="Reason" htmlFor="ap-reason">
        <Textarea id="ap-reason" rows={2} placeholder="Chief complaint or purpose of the visit" />
      </Field>
    </ParamDialog>
  );
}
