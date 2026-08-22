"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CalendarPlus,
  FilePlus,
  MessageSquare,
  MoreHorizontal,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import type { PatientDetailDTO } from "@/lib/server/services/patients";
import type { PatientRecordBundle } from "@/lib/server/services/patient-record";
import type { TimelineEvent } from "@/lib/types";
import { archivePatient } from "@/app/actions/patients";
import { patientStatus } from "@/lib/status";
import { relativeDay } from "@/lib/format";
import { useViewer } from "@/components/shell/viewer-context";
import { RecordHeader } from "@/components/record/record-header";
import { Spine } from "@/components/record/spine";
import { PatientOverview } from "@/components/patient/overview";
import {
  AppointmentsTab,
  CommunicationsTab,
  DocumentsTab,
  FeedbackTab,
  FollowUpsTab,
  NotesTab,
  ReferralsTab,
  TabPanel,
} from "@/components/patient/tabs";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { Protected } from "@/components/healthcare/protected";
import { StatusChip } from "@/components/healthcare/status-chip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

interface PatientRecordClientProps {
  patient: PatientDetailDTO;
  record: PatientRecordBundle;
  events: TimelineEvent[];
}

export function PatientRecordClient({ patient, record, events }: PatientRecordClientProps) {
  const router = useRouter();
  // Courtesy only: revealAction checks the same capability server-side.
  const canReveal = useViewer().permissions.capabilities.includes("reveal");
  const tab = useSearchParams().get("tab") ?? "overview";
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivePending, startArchive] = useTransition();

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "timeline", label: "Timeline" },
    { id: "appointments", label: "Appointments", count: record.appointments.length },
    { id: "communications", label: "Communications", count: record.conversations.length },
    { id: "follow-ups", label: "Follow-ups", count: record.openFollowUpCount },
    { id: "referrals", label: "Referrals", count: record.referrals.length },
    { id: "feedback", label: "Feedback", count: record.feedback.length },
    { id: "documents", label: "Documents", count: record.documents.length },
    { id: "notes", label: "Notes", count: record.notes.length },
  ];

  function handleArchive() {
    startArchive(async () => {
      const result = await archivePatient(patient.reference, "Archived from the patient record.");
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      // Close only on success — closing first would show the dialog
      // disappearing as if it worked, then a delayed error toast with the
      // record still active and the dialog already gone.
      setArchiveOpen(false);
      toast("Patient archived", {
        description: `${patient.reference} no longer appears in active lists.`,
      });
      router.push("/patients");
    });
  }

  return (
    <div className="mx-auto max-w-[100rem]">
      <RecordHeader
        breadcrumb={{ label: "Patients", href: "/patients" }}
        avatar={
          <PersonAvatar
            name={patient.name}
            id={patient.reference}
            size="lg"
            initials={patient.initials}
          />
        }
        title={patient.name}
        identifier={patient.reference}
        chips={
          <>
            <StatusChip meta={patientStatus[patient.status]} size="md" />
            {patient.tags.map((t) => (
              <span
                key={t}
                className="rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 text-caption text-ink-2"
              >
                {t}
              </span>
            ))}
          </>
        }
        facts={[
          {
            label: "Mobile",
            value: (
              <Protected
                masked={patient.phone.masked}
                revealable={patient.phone.revealable && canReveal}
                resource="patient"
                resourceId={patient.reference}
                field="phone"
                label="Mobile number"
              />
            ),
          },
          {
            label: "Assigned doctor",
            value: patient.doctor ? (
              <Link href={`/doctors/${patient.doctor.reference}`} className="hover:text-primary">
                {patient.doctor.name}
              </Link>
            ) : (
              "Unassigned"
            ),
          },
          { label: "Department", value: patient.department?.name ?? "Unassigned" },
          {
            label: "Next appointment",
            value: patient.nextAppointment ? relativeDay(patient.nextAppointment) : "None booked",
          },
        ]}
        actions={
          <>
            <Button size="sm" asChild>
              <Link href="/appointments?create=1">
                <CalendarPlus className="size-3.5" strokeWidth={2.25} />
                Book appointment
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/inbox?compose=1">
                <MessageSquare className="size-3.5" strokeWidth={2} />
                Send message
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/follow-ups?create=1">
                <Timer className="size-3.5" strokeWidth={2} />
                Follow-up
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast("Note editor", { description: "Opens on the Notes tab." })}
            >
              <FilePlus className="size-3.5" strokeWidth={2} />
              Add note
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="outline" aria-label="More actions">
                  <MoreHorizontal className="size-4" strokeWidth={2} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem>Edit patient details</DropdownMenuItem>
                <DropdownMenuItem>Assign to another doctor</DropdownMenuItem>
                <DropdownMenuItem>Add to campaign</DropdownMenuItem>
                <DropdownMenuItem>Export record</DropdownMenuItem>
                <DropdownMenuSeparator />
                <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={(e) => e.preventDefault()}
                    >
                      Archive patient
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Archive {patient.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The record leaves active patient lists and stops receiving
                        campaigns. Appointment history, notes, and the audit trail
                        are kept, and a hospital administrator can restore it at any
                        time.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={archivePending}>Keep active</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-danger text-ink-inverse hover:bg-danger/90"
                        disabled={archivePending}
                        onClick={(e) => {
                          // Stay open until the action resolves — Radix closes
                          // on click by default, and a failed archive must not
                          // look like it succeeded before the error toast lands.
                          e.preventDefault();
                          handleArchive();
                        }}
                      >
                        {archivePending ? "Archiving…" : "Archive patient"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        tabs={tabs}
        activeTab={tab}
      />

      {tab === "overview" && <PatientOverview patient={patient} record={record} />}

      {tab === "timeline" && (
        <TabPanel
          title="Activity spine"
          description="Every appointment, message, follow-up, and record change in the order it happened."
        >
          <Spine events={events} />
        </TabPanel>
      )}

      {tab === "appointments" && (
        <TabPanel
          title="Appointments"
          description="Complete history, most recent first"
          actions={
            <Button size="sm" asChild>
              <Link href="/appointments?create=1">Book appointment</Link>
            </Button>
          }
        >
          <AppointmentsTab items={record.appointments} />
        </TabPanel>
      )}

      {tab === "communications" && (
        <TabPanel
          title="Communications"
          description={`SMS, email, WhatsApp, and logged calls · prefers ${patient.preferredChannel.toUpperCase()}`}
          actions={
            <Button size="sm" asChild>
              <Link href="/inbox?compose=1">New message</Link>
            </Button>
          }
        >
          <CommunicationsTab items={record.conversations} />
        </TabPanel>
      )}

      {tab === "follow-ups" && (
        <TabPanel
          title="Follow-ups"
          description="Pending, overdue, and completed"
          actions={<Button size="sm">Create follow-up</Button>}
        >
          <FollowUpsTab items={record.followUps} />
        </TabPanel>
      )}

      {tab === "referrals" && (
        <TabPanel title="Referrals" description="Where this patient came from">
          <ReferralsTab items={record.referrals} />
        </TabPanel>
      )}

      {tab === "feedback" && (
        <TabPanel title="Feedback" description="Survey responses and ratings">
          <FeedbackTab items={record.feedback} />
        </TabPanel>
      )}

      {tab === "documents" && (
        <TabPanel
          title="Documents"
          description="CRM attachments only. Clinical records stay in the EMR."
          actions={<Button size="sm">Upload</Button>}
        >
          <DocumentsTab items={record.documents} />
        </TabPanel>
      )}

      {tab === "notes" && (
        <TabPanel
          title="Internal notes"
          description="Visible to staff with access to this patient. Never sent to the patient."
          actions={<Button size="sm">Add note</Button>}
        >
          <NotesTab items={record.notes} />
        </TabPanel>
      )}
    </div>
  );
}
