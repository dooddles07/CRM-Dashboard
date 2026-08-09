import Link from "next/link";
import { ArrowRight, CalendarDays, ClipboardList, TriangleAlert } from "lucide-react";
import { Panel, PanelHeader } from "@/components/data/panel";
import { StatusChip } from "@/components/healthcare/status-chip";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { EmptyState } from "@/components/data/states";
import { appointmentStatus, priorityMeta } from "@/lib/status";
import { departmentName, day } from "@/lib/data/constants";
import { doctorById, patientById, staffName } from "@/lib/data/people";
import { appointmentsOn } from "@/lib/data/scheduling";
import { tasks } from "@/lib/data/work";
import { alerts } from "@/lib/data/analytics";
import { relativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";

const alertTone = {
  danger: "border-danger-line bg-danger-soft text-danger",
  warning: "border-warning-line bg-warning-soft text-warning",
} as const;

export function TodaysAppointments() {
  const today = appointmentsOn(day(0));

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Today's appointments"
        description={`${today.length} scheduled · Monday 10 August`}
        actions={
          <Link
            href="/appointments"
            className="inline-flex items-center gap-1 text-body-sm text-primary underline-offset-2 hover:underline"
          >
            All appointments
            <ArrowRight aria-hidden className="size-3.5" strokeWidth={2.25} />
          </Link>
        }
      />

      {today.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing booked today"
          description="Appointments booked for today will appear here as they are confirmed."
          compact
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse">
            <caption className="sr-only">
              Appointments scheduled for today, ordered by start time
            </caption>
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th scope="col" className="px-4 py-2 text-label text-ink-3">Time</th>
                <th scope="col" className="px-4 py-2 text-label text-ink-3">Patient</th>
                <th scope="col" className="px-4 py-2 text-label text-ink-3">Doctor</th>
                <th scope="col" className="px-4 py-2 text-label text-ink-3">Department</th>
                <th scope="col" className="px-4 py-2 text-label text-ink-3">Type</th>
                <th scope="col" className="px-4 py-2 text-label text-ink-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {today.map((a) => {
                const patient = patientById(a.patientId);
                const doctor = doctorById(a.doctorId);
                return (
                  <tr
                    key={a.id}
                    className="border-b border-line transition-colors duration-150 last:border-0 hover:bg-surface-2"
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-body-sm font-medium text-ink tabular-nums">
                      {a.start}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/patients/${a.patientId}`}
                        className="flex items-center gap-2 text-body-sm text-ink hover:text-primary"
                      >
                        <PersonAvatar
                          name={patient?.name ?? "Unknown"}
                          id={a.patientId}
                          size="xs"
                          initials={patient?.initials}
                        />
                        <span className="truncate">{patient?.name ?? "Unknown"}</span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-body-sm text-ink-2">
                      {doctor?.name ?? "Unassigned"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-body-sm text-ink-2">
                      {departmentName(a.departmentId)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-body-sm text-ink-2">
                      {a.type}
                    </td>
                    <td className="px-4 py-2">
                      <StatusChip meta={appointmentStatus[a.status]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function AlertsPanel() {
  return (
    <Panel>
      <PanelHeader title="Needs attention" description="Work that is already late" />
      <ul className="divide-y divide-line">
        {alerts.map((a) => (
          <li key={a.id}>
            <Link
              href={a.href}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-surface-2"
            >
              <span
                className={cn(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-md border",
                  alertTone[a.tone],
                )}
              >
                <TriangleAlert aria-hidden className="size-3.5" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-medium text-ink">
                  {a.label}
                </span>
                <span className="block truncate text-caption text-ink-3">{a.detail}</span>
              </span>
              <ArrowRight aria-hidden className="size-3.5 shrink-0 text-ink-3" strokeWidth={2} />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function UpcomingTasks() {
  const due = tasks
    .filter((t) => t.status !== "done" && t.dueDate <= day(0))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);
  const overdue = due.filter((t) => t.dueDate < day(0)).length;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Tasks due today"
        description={
          overdue > 0
            ? `${due.length} open · ${overdue} carried over from earlier`
            : `${due.length} open`
        }
        actions={
          <Link
            href="/tasks"
            className="text-body-sm text-primary underline-offset-2 hover:underline"
          >
            All tasks
          </Link>
        }
      />
      {due.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nothing due today"
          description="Tasks assigned to you appear here on their due date."
          compact
        />
      ) : (
        <ul className="divide-y divide-line">
          {due.map((t) => {
            const patient = t.patientId ? patientById(t.patientId) : null;
            return (
              <li key={t.id} className="px-4 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-body-sm leading-5 text-ink">{t.title}</p>
                  <StatusChip meta={priorityMeta[t.priority]} className="shrink-0" />
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-ink-3">
                  {t.dueDate < day(0) && (
                    <span className="font-medium text-danger">
                      Overdue · {relativeDay(t.dueDate).toLowerCase()}
                    </span>
                  )}
                  <span>{staffName(t.ownerId)}</span>
                  <span aria-hidden>·</span>
                  <span>{t.category}</span>
                  {patient && (
                    <>
                      <span aria-hidden>·</span>
                      <Link
                        href={`/patients/${patient.id}`}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {patient.name}
                      </Link>
                    </>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
