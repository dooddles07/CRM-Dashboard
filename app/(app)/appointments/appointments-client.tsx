"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import type { AppointmentDTO } from "@/lib/server/services/appointments";
import { createAppointment, cancelAppointment } from "@/app/actions/appointments";
import { recordExport } from "@/app/actions/pipeline";
import { appointmentStatus } from "@/lib/status";
import { formatDateShort, formatTime, relativeDay, daysFromToday } from "@/lib/format";
import { PageHeader } from "@/components/data/page-header";
import { DataTable } from "@/components/data/data-table";
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

const types = ["Consultation", "Follow-up", "Procedure", "Screening", "Vaccination", "Teleconsult"];

interface AppointmentsClientProps {
  rows: AppointmentDTO[];
  total: number;
  departments: { id: string; name: string }[];
  doctors: { reference: string; name: string }[];
  patients: { reference: string; name: string }[];
}

export function AppointmentsClient({
  rows,
  total,
  departments,
  doctors,
  patients,
}: AppointmentsClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [scope, setScope] = useState<ScopeId>("today");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    return rows
      .filter((a) => {
        const delta = daysFromToday(a.startsAt);
        if (scope === "today" && delta !== 0) return false;
        if (scope === "upcoming" && delta < 0) return false;
        if (scope === "past" && delta >= 0) return false;
        if (department !== "all" && a.department.id !== department) return false;
        if (status !== "all" && a.status !== status) return false;
        if (search) {
          const q = search.toLowerCase();
          const hit =
            a.reference.toLowerCase().includes(q) ||
            a.patient.name.toLowerCase().includes(q) ||
            a.doctor.name.toLowerCase().includes(q) ||
            (a.reason ?? "").toLowerCase().includes(q);
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
  }, [rows, scope, department, status, search]);

  const activeFilters = (department !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0);

  const cancel = useCallback(
    (reference: string) => {
      startTransition(async () => {
        const result = await cancelAppointment(reference, "Cancelled from the appointments list.");
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        toast("Appointment cancelled", { description: `${reference} · the time is now free.` });
        router.refresh();
      });
    },
    [router],
  );

  const columns = useMemo<ColumnDef<AppointmentDTO, unknown>[]>(
    () => [
      {
        accessorKey: "reference",
        header: "ID",
        cell: ({ row }) => <span className="text-ident text-ink-3">{row.original.reference}</span>,
      },
      {
        id: "patient",
        header: "Patient",
        accessorFn: (a) => a.patient.name,
        cell: ({ row }) => (
          <Link
            href={`/patients/${row.original.patient.reference}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 font-medium text-ink hover:text-primary"
          >
            <PersonAvatar name={row.original.patient.name} id={row.original.patient.reference} size="xs" />
            <span className="whitespace-nowrap">{row.original.patient.name}</span>
          </Link>
        ),
      },
      {
        id: "doctor",
        header: "Doctor",
        accessorFn: (a) => a.doctor.name,
        cell: ({ row }) => (
          <Link
            href={`/doctors/${row.original.doctor.reference}`}
            onClick={(e) => e.stopPropagation()}
            className="whitespace-nowrap hover:text-primary"
          >
            {row.original.doctor.name}
          </Link>
        ),
      },
      {
        id: "department",
        header: "Department",
        accessorFn: (a) => a.department.name,
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.department.name}</span>,
      },
      { accessorKey: "type", header: "Type" },
      {
        id: "when",
        header: "When",
        accessorFn: (a) => a.startsAt,
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <span className="text-ink">{formatDateShort(row.original.startsAt)}</span>
            <span className="ml-1.5 text-ink-3 tabular-nums">{formatTime(row.original.startsAt)}</span>
            <span className="ml-1.5 text-caption text-ink-3">{relativeDay(row.original.startsAt)}</span>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusChip meta={appointmentStatus[row.original.status]} />,
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
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.reference}`}>
                  <MoreHorizontal className="size-4" strokeWidth={2} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href={`/appointments/${row.original.reference}`}>Open appointment</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={pending || row.original.status === "cancelled"}
                  onSelect={() => cancel(row.original.reference)}
                >
                  Cancel appointment
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [pending, cancel],
  );

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Appointments"
        description={
          filtered.length === total
            ? `${total} appointment${total === 1 ? "" : "s"} you can see.`
            : `${filtered.length} of ${total} shown.`
        }
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
                void recordExport("appointments", "appointment_list", `scope:${scope}`, filtered.length).then(
                  (result) => {
                    if (!result.ok) {
                      toast.error(result.message);
                      return;
                    }
                    toast("Export queued", {
                      description: `${filtered.length} appointments · recorded in the audit log.`,
                    });
                  },
                );
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
        getRowId={(a) => a.reference}
        onRowClick={(a) => router.push(`/appointments/${a.reference}`)}
        pageSize={12}
        minWidth="72rem"
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

      <BookAppointmentDialog doctors={doctors} patients={patients} />
    </div>
  );
}

function BookAppointmentDialog({
  doctors,
  patients,
}: {
  doctors: { reference: string; name: string }[];
  patients: { reference: string; name: string }[];
}) {
  const router = useRouter();
  const [patient, setPatient] = useState("");
  const [doctor, setDoctor] = useState("");
  const [type, setType] = useState("Consultation");
  const [when, setWhen] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [reason, setReason] = useState("");

  function submit() {
    if (!patient || !doctor || !when) {
      toast.error("Patient, doctor, and a start time are required.");
      return false;
    }

    void createAppointment({
      patientReference: patient,
      doctorReference: doctor,
      type,
      startsAt: new Date(when).toISOString(),
      durationMinutes: Number(durationMinutes),
      reason: reason.trim() || null,
    }).then((result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast("Appointment booked", { description: result.data.reference });
      router.push(`/appointments/${result.data.reference}`);
    });
  }

  return (
    <ParamDialog title="Book appointment" submitLabel="Book" onSubmit={submit}>
      <Field label="Patient" htmlFor="ap-patient">
        <Select value={patient} onValueChange={setPatient}>
          <SelectTrigger id="ap-patient" className="w-full">
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
      <Field label="Doctor" htmlFor="ap-doctor">
        <Select value={doctor} onValueChange={setDoctor}>
          <SelectTrigger id="ap-doctor" className="w-full">
            <SelectValue placeholder="Select a doctor" />
          </SelectTrigger>
          <SelectContent>
            {doctors.map((d) => (
              <SelectItem key={d.reference} value={d.reference}>
                {d.name}
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
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="When" htmlFor="ap-when">
          <Input
            id="ap-when"
            type="datetime-local"
            className="h-9"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Duration (minutes)" htmlFor="ap-duration">
        <Input
          id="ap-duration"
          type="number"
          min={5}
          max={480}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
          className="h-9"
        />
      </Field>
      <Field label="Reason" htmlFor="ap-reason">
        <Textarea
          id="ap-reason"
          rows={2}
          placeholder="Chief complaint or purpose of the appointment"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </ParamDialog>
  );
}
