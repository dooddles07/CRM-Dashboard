"use client";

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CalendarPlus,
  FilePlus,
  MessageSquare,
  MoreHorizontal,
  Timer,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { useCareflow } from "@/lib/store";
import { buildTimeline } from "@/lib/timeline";
import { patientStatus } from "@/lib/status";
import { departmentName } from "@/lib/data/constants";
import { doctorById } from "@/lib/data/people";
import { appointmentsFor } from "@/lib/data/scheduling";
import { followUpsFor } from "@/lib/data/work";
import {
  conversationsFor,
  documentsFor,
  feedbackFor,
  notesFor,
  referralsForPatient,
} from "@/lib/data/patient-record";
import { mask, relativeDay } from "@/lib/format";
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
import { ErrorState } from "@/components/data/states";
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

export default function PatientRecordPage() {
  // Courtesy only: revealAction checks the same capability server-side.
  const canReveal = useViewer().permissions.capabilities.includes("reveal");
  const { id } = useParams<{ id: string }>();
  const tab = useSearchParams().get("tab") ?? "overview";
  const patient = useCareflow((s) => s.patients.find((p) => p.id === id));
  const updatePatient = useCareflow((s) => s.updatePatient);

  if (!patient) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState
          icon={UserX}
          title="We could not find that patient"
          description="The record may have been archived, merged, or you may not have access to it."
          reference={id}
          action={
            <>
              <Button size="sm" asChild>
                <Link href="/patients">Back to patients</Link>
              </Button>
              <Button size="sm" variant="outline">
                Contact support
              </Button>
            </>
          }
        />
      </div>
    );
  }

  const openFollowUps = followUpsFor(patient.id).filter(
    (f) => f.status === "pending" || f.status === "overdue",
  );

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "timeline", label: "Timeline" },
    { id: "appointments", label: "Appointments", count: appointmentsFor(patient.id).length },
    { id: "communications", label: "Communications", count: conversationsFor(patient.id).length },
    { id: "follow-ups", label: "Follow-ups", count: openFollowUps.length },
    { id: "referrals", label: "Referrals", count: referralsForPatient(patient.name).length },
    { id: "feedback", label: "Feedback", count: feedbackFor(patient.id).length },
    { id: "documents", label: "Documents", count: documentsFor(patient.id).length },
    { id: "notes", label: "Notes", count: notesFor(patient.id).length },
  ];

  return (
    <div className="mx-auto max-w-[100rem]">
      <RecordHeader
        breadcrumb={{ label: "Patients", href: "/patients" }}
        avatar={
          <PersonAvatar
            name={patient.name}
            id={patient.id}
            size="lg"
            initials={patient.initials}
          />
        }
        title={patient.name}
        identifier={patient.id}
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
                masked={mask(patient.phone, "phone")}
              revealable={canReveal}
                resource="patient"
                resourceId={patient.id}
                field="phone" label="Mobile number"
              />
            ),
          },
          {
            label: "Assigned doctor",
            value: (
              <Link
                href={`/doctors/${patient.doctorId}`}
                className="hover:text-primary"
              >
                {doctorById(patient.doctorId)?.name ?? "Unassigned"}
              </Link>
            ),
          },
          { label: "Department", value: departmentName(patient.departmentId) },
          {
            label: "Next appointment",
            value: patient.nextAppointment
              ? relativeDay(patient.nextAppointment)
              : "None booked",
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
                <AlertDialog>
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
                      <AlertDialogCancel>Keep active</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-danger text-ink-inverse hover:bg-danger/90"
                        onClick={() => {
                          updatePatient(patient.id, { status: "archived" });
                          toast("Patient archived", {
                            description: `${patient.id} no longer appears in active lists.`,
                          });
                        }}
                      >
                        Archive patient
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

      {tab === "overview" && <PatientOverview patient={patient} />}

      {tab === "timeline" && (
        <TabPanel
          title="Activity spine"
          description="Every appointment, message, follow-up, and record change in the order it happened."
        >
          <Spine events={buildTimeline(patient)} />
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
          <AppointmentsTab patient={patient} />
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
          <CommunicationsTab patient={patient} />
        </TabPanel>
      )}

      {tab === "follow-ups" && (
        <TabPanel
          title="Follow-ups"
          description="Pending, overdue, and completed"
          actions={<Button size="sm">Create follow-up</Button>}
        >
          <FollowUpsTab patient={patient} />
        </TabPanel>
      )}

      {tab === "referrals" && (
        <TabPanel title="Referrals" description="Where this patient came from">
          <ReferralsTab patient={patient} />
        </TabPanel>
      )}

      {tab === "feedback" && (
        <TabPanel title="Feedback" description="Survey responses and ratings">
          <FeedbackTab patient={patient} />
        </TabPanel>
      )}

      {tab === "documents" && (
        <TabPanel
          title="Documents"
          description="CRM attachments only. Clinical records stay in the EMR."
          actions={<Button size="sm">Upload</Button>}
        >
          <DocumentsTab patient={patient} />
        </TabPanel>
      )}

      {tab === "notes" && (
        <TabPanel
          title="Internal notes"
          description="Visible to staff with access to this patient. Never sent to the patient."
          actions={<Button size="sm">Add note</Button>}
        >
          <NotesTab patient={patient} />
        </TabPanel>
      )}
    </div>
  );
}
