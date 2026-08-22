"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, CircleCheck, MessageSquare, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { AppointmentDTO } from "@/lib/server/services/appointments";
import type { AppointmentStatus } from "@/lib/types";
import { updateAppointment, cancelAppointment } from "@/app/actions/appointments";
import { appointmentStatus } from "@/lib/status";
import { formatDate, formatTime } from "@/lib/format";
import { RecordHeader } from "@/components/record/record-header";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { StatusChip } from "@/components/healthcare/status-chip";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const nextStatus: Partial<Record<AppointmentStatus, { label: string; to: AppointmentStatus }>> = {
  requested: { label: "Confirm", to: "confirmed" },
  pending: { label: "Confirm", to: "confirmed" },
  confirmed: { label: "Check in", to: "checked-in" },
  "checked-in": { label: "Complete", to: "completed" },
  "in-consultation": { label: "Complete", to: "completed" },
};

const reschedulable: AppointmentStatus[] = [
  "requested",
  "pending",
  "confirmed",
  "checked-in",
  "in-consultation",
  "rescheduled",
];

/** toISOString().slice(0, 16) is a datetime-local value in UTC — near enough for prefill. */
function toDatetimeLocal(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16);
}

export function AppointmentRecordClient({ appointment }: { appointment: AppointmentDTO }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [when, setWhen] = useState(() => toDatetimeLocal(appointment.startsAt));
  const [durationMinutes, setDurationMinutes] = useState(String(appointment.durationMinutes));

  const advance = nextStatus[appointment.status];

  function setStatus(status: AppointmentStatus) {
    startTransition(async () => {
      const result = await updateAppointment(appointment.reference, { status });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast(appointmentStatus[status].label, { description: appointment.reference });
      router.refresh();
    });
  }

  function reschedule() {
    startTransition(async () => {
      const result = await updateAppointment(appointment.reference, {
        startsAt: new Date(when).toISOString(),
        durationMinutes: Number(durationMinutes),
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setRescheduleOpen(false);
      toast("Appointment rescheduled", { description: appointment.reference });
      router.refresh();
    });
  }

  function cancel() {
    startTransition(async () => {
      const result = await cancelAppointment(appointment.reference, cancelReason);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setCancelOpen(false);
      toast("Appointment cancelled", { description: `${appointment.reference} · the slot is now free.` });
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-[100rem]">
      <RecordHeader
        breadcrumb={{ label: "Appointments", href: "/appointments" }}
        avatar={<PersonAvatar name={appointment.patient.name} id={appointment.patient.reference} size="lg" />}
        title={`${appointment.type} · ${appointment.patient.name}`}
        identifier={appointment.reference}
        chips={<StatusChip meta={appointmentStatus[appointment.status]} size="md" />}
        facts={[
          {
            label: "When",
            value: `${formatDate(appointment.startsAt)} · ${formatTime(appointment.startsAt)}`,
          },
          { label: "Duration", value: `${appointment.durationMinutes} min` },
          {
            label: "Doctor",
            value: (
              <Link href={`/doctors/${appointment.doctor.reference}`} className="hover:text-primary">
                {appointment.doctor.name}
              </Link>
            ),
          },
          { label: "Location", value: appointment.location ?? "Not set" },
        ]}
        actions={
          <>
            {advance && (
              <Button size="sm" disabled={pending} onClick={() => setStatus(advance.to)}>
                <Check className="size-3.5" strokeWidth={2.5} />
                {advance.label}
              </Button>
            )}

            {reschedulable.includes(appointment.status) && (
              <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <RotateCcw className="size-3.5" strokeWidth={2} />
                    Reschedule
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Reschedule {appointment.reference}</DialogTitle>
                    <DialogDescription>
                      The exclusion constraint refuses an overlapping slot for this doctor.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3.5 py-1">
                    <div className="space-y-1.5">
                      <Label htmlFor="reschedule-when">New start time</Label>
                      <Input
                        id="reschedule-when"
                        type="datetime-local"
                        value={when}
                        onChange={(e) => setWhen(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reschedule-duration">Duration (minutes)</Label>
                      <Input
                        id="reschedule-duration"
                        type="number"
                        min={5}
                        max={480}
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => setRescheduleOpen(false)} disabled={pending}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={reschedule} disabled={pending}>
                      {pending ? "Saving…" : "Save"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            <Button size="sm" variant="outline" asChild>
              <Link href="/inbox?compose=1">
                <MessageSquare className="size-3.5" strokeWidth={2} />
                Message
              </Link>
            </Button>

            {appointment.status !== "cancelled" && appointment.status !== "completed" && (
              <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="text-danger hover:text-danger">
                    Cancel appointment
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel {appointment.reference}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The slot is released for rebooking. The record and its history stay on the
                      patient&rsquo;s timeline.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-1.5 px-1">
                    <Label htmlFor="cancel-reason">Reason</Label>
                    <Input
                      id="cancel-reason"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Why is this being cancelled?"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>Keep appointment</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-danger text-ink-inverse hover:bg-danger/90"
                      disabled={pending || cancelReason.trim().length === 0}
                      onClick={(e) => {
                        e.preventDefault();
                        cancel();
                      }}
                    >
                      {pending ? "Cancelling…" : "Cancel appointment"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </>
        }
        tabs={[{ id: "details", label: "Details" }]}
        activeTab="details"
      />

      <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Visit details" />
          <PanelBody className="space-y-4">
            <Detail label="Reason for visit" value={appointment.reason ?? "Not provided"} muted={!appointment.reason} />
            <Detail
              label="Clinical notes"
              value={appointment.notes ?? "No notes recorded for this appointment."}
              muted={!appointment.notes}
            />
            <Detail label="Department" value={appointment.department.name} />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Patient" />
          <PanelBody className="space-y-3">
            <Link
              href={`/patients/${appointment.patient.reference}`}
              className="flex items-center gap-3 hover:text-primary"
            >
              <PersonAvatar name={appointment.patient.name} id={appointment.patient.reference} size="md" />
              <div className="min-w-0">
                <p className="font-medium text-ink">{appointment.patient.name}</p>
                <p className="text-ident text-ink-3">{appointment.patient.reference}</p>
              </div>
            </Link>
            <div className="flex items-center gap-1.5 border-t border-line pt-3 text-body-sm text-ink-3">
              <CircleCheck className="size-3.5" strokeWidth={2} aria-hidden />
              Open the patient record for full history and contact details.
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

function Detail({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <p className="text-label text-ink-3">{label}</p>
      <p className={muted ? "mt-0.5 text-body-sm text-ink-3" : "mt-0.5 text-body-sm text-ink"}>{value}</p>
    </div>
  );
}
