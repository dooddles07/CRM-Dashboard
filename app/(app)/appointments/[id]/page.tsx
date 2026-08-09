"use client";

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CalendarX,
  Check,
  MessageSquare,
  MoreHorizontal,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { appointments, appointmentsFor } from "@/lib/data/scheduling";
import { patientById, doctorById } from "@/lib/data/people";
import { departmentName } from "@/lib/data/constants";
import { appointmentStatus } from "@/lib/status";
import { buildTimeline } from "@/lib/timeline";
import { formatDate, formatDateShort, relativeDay } from "@/lib/format";
import { RecordHeader } from "@/components/record/record-header";
import { Spine } from "@/components/record/spine";
import { TabPanel } from "@/components/patient/tabs";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { StatusChip } from "@/components/healthcare/status-chip";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { EmptyState, ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tab = useSearchParams().get("tab") ?? "details";
  const appointment = appointments.find((a) => a.id === id);

  if (!appointment) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState
          icon={CalendarX}
          title="We could not find that appointment"
          description="It may have been cancelled or merged into another booking."
          reference={id}
          action={
            <Button size="sm" asChild>
              <Link href="/appointments">Back to appointments</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const patient = patientById(appointment.patientId);
  const doctor = doctorById(appointment.doctorId);
  const related = appointmentsFor(appointment.patientId).filter((a) => a.id !== appointment.id);

  const tabs = [
    { id: "details", label: "Details" },
    { id: "timeline", label: "Patient timeline" },
    { id: "related", label: "Other visits", count: related.length },
  ];

  return (
    <div className="mx-auto max-w-[100rem]">
      <RecordHeader
        breadcrumb={{ label: "Appointments", href: "/appointments" }}
        avatar={
          <PersonAvatar
            name={patient?.name ?? "Unknown"}
            id={appointment.patientId}
            size="lg"
            initials={patient?.initials}
          />
        }
        title={`${appointment.type} · ${patient?.name ?? appointment.patientId}`}
        identifier={appointment.id}
        chips={<StatusChip meta={appointmentStatus[appointment.status]} size="md" />}
        facts={[
          {
            label: "When",
            value: `${formatDate(appointment.date)} · ${appointment.start}`,
          },
          { label: "Duration", value: `${appointment.durationMinutes} min` },
          {
            label: "Doctor",
            value: (
              <Link href={`/doctors/${appointment.doctorId}`} className="hover:text-primary">
                {doctor?.name ?? "Unassigned"}
              </Link>
            ),
          },
          { label: "Location", value: appointment.location },
        ]}
        actions={
          <>
            <Button
              size="sm"
              onClick={() => toast("Checked in", { description: `${patient?.name ?? "Patient"} marked as arrived.` })}
            >
              <Check className="size-3.5" strokeWidth={2.5} />
              Check in
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast("Reschedule", { description: "Opens the scheduling drawer." })}
            >
              <RotateCcw className="size-3.5" strokeWidth={2} />
              Reschedule
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/inbox?compose=1">
                <MessageSquare className="size-3.5" strokeWidth={2} />
                Message
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="outline" aria-label="More actions">
                  <MoreHorizontal className="size-4" strokeWidth={2} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem>Mark completed</DropdownMenuItem>
                <DropdownMenuItem>Add to a follow-up</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => toast("Appointment cancelled")}>
                  Cancel appointment
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        tabs={tabs}
        activeTab={tab}
      />

      {tab === "details" && (
        <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          <Panel className="lg:col-span-2">
            <PanelHeader title="Visit details" />
            <PanelBody className="space-y-4">
              <Detail label="Reason for visit" value={appointment.reason} />
              <Detail
                label="Clinical notes"
                value={appointment.notes ?? "No notes recorded for this appointment."}
                muted={!appointment.notes}
              />
              <Detail label="Department" value={departmentName(appointment.departmentId)} />
              <Detail
                label="Reminder"
                value={
                  appointment.reminderChannel
                    ? `Sent by ${appointment.reminderChannel.toUpperCase()}`
                    : "No reminder configured"
                }
                muted={!appointment.reminderChannel}
              />
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Patient" />
            <PanelBody className="space-y-3">
              {patient ? (
                <>
                  <Link
                    href={`/patients/${patient.id}`}
                    className="flex items-center gap-3 hover:text-primary"
                  >
                    <PersonAvatar name={patient.name} id={patient.id} size="md" initials={patient.initials} />
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{patient.name}</p>
                      <p className="text-ident text-ink-3">{patient.id}</p>
                    </div>
                  </Link>
                  <div className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-body-sm">
                    <Detail label="Age" value={`${patient.age}`} inline />
                    <Detail label="Gender" value={patient.gender} inline />
                    <Detail
                      label="Next appointment"
                      value={patient.nextAppointment ? relativeDay(patient.nextAppointment) : "None"}
                      inline
                    />
                    <Detail label="Status" value={patient.status} inline />
                  </div>
                </>
              ) : (
                <p className="text-body-sm text-ink-3">Patient record unavailable.</p>
              )}
            </PanelBody>
          </Panel>
        </div>
      )}

      {tab === "timeline" && patient && (
        <TabPanel
          title="Patient timeline"
          description="Full history for this patient, most recent first."
        >
          <Spine events={buildTimeline(patient)} />
        </TabPanel>
      )}

      {tab === "related" && (
        <TabPanel title="Other visits" description="Every other appointment for this patient.">
          {related.length === 0 ? (
            <EmptyState
              icon={CalendarX}
              title="No other visits"
              description="This is the only appointment on record for this patient."
              compact
            />
          ) : (
            <ul className="divide-y divide-line">
              {related.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/appointments/${a.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2"
                  >
                    <span className="w-24 shrink-0 text-body-sm font-medium text-ink tabular-nums">
                      {formatDateShort(a.date)} {a.start}
                    </span>
                    <span className="min-w-0 flex-1 text-body-sm text-ink-2">
                      {a.type} · {a.reason}
                    </span>
                    <StatusChip meta={appointmentStatus[a.status]} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabPanel>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  muted,
  inline,
}: {
  label: string;
  value: string;
  muted?: boolean;
  inline?: boolean;
}) {
  return (
    <div className={inline ? "min-w-0" : undefined}>
      <p className="text-label text-ink-3">{label}</p>
      <p className={muted ? "mt-0.5 text-body-sm text-ink-3" : "mt-0.5 text-body-sm text-ink"}>
        {value}
      </p>
    </div>
  );
}
