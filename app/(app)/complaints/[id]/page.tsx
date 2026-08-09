"use client";

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  MessageSquare,
  MessageSquareWarning,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import type { TimelineEvent } from "@/lib/types";
import { complaintById } from "@/lib/data/experience";
import { patientById, staffById, staffName } from "@/lib/data/people";
import { departmentName } from "@/lib/data/constants";
import { caseStatus, priorityMeta } from "@/lib/status";
import { daysFromToday, formatDate, relativeDay } from "@/lib/format";
import { RecordHeader } from "@/components/record/record-header";
import { Spine } from "@/components/record/spine";
import { StatusChip } from "@/components/healthcare/status-chip";
import { TabPanel } from "@/components/patient/tabs";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { EmptyState, ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OPEN = ["new", "assigned", "investigating", "waiting"];

export default function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tab = useSearchParams().get("tab") ?? "details";
  const complaint = complaintById(id);

  if (!complaint) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState
          icon={MessageSquareWarning}
          title="We could not find that case"
          description="It may have been closed and archived."
          reference={id}
          action={
            <Button size="sm" asChild>
              <Link href="/complaints">Back to complaints</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const patient = patientById(complaint.patientId);
  const owner = staffById(complaint.ownerId);
  const isOpen = OPEN.includes(complaint.status);
  const breached = isOpen && daysFromToday(complaint.slaDueAt) < 0;

  const events: TimelineEvent[] = [
    {
      id: `ct-opened-${complaint.id}`,
      subjectId: complaint.id,
      kind: "complaint",
      title: "Case opened",
      detail: complaint.subject,
      at: complaint.openedAt,
      actor: patient?.name ?? null,
      tone: "danger",
    },
    {
      id: `ct-assigned-${complaint.id}`,
      subjectId: complaint.id,
      kind: "task",
      title: `Assigned to ${owner?.name ?? "the department queue"}`,
      detail: `${complaint.type} · ${departmentName(complaint.departmentId)}`,
      at: complaint.openedAt,
      actor: null,
      tone: "info",
    },
  ];
  if (complaint.resolution) {
    events.unshift({
      id: `ct-resolved-${complaint.id}`,
      subjectId: complaint.id,
      kind: "record",
      title: complaint.status === "closed" ? "Case closed" : "Case resolved",
      detail: complaint.resolution,
      at: complaint.slaDueAt,
      actor: owner?.name ?? null,
      tone: "success",
    });
  }
  events.sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <div className="mx-auto max-w-[100rem]">
      <RecordHeader
        breadcrumb={{ label: "Complaints", href: "/complaints" }}
        avatar={
          <span
            className={cn(
              "inline-flex size-12 items-center justify-center rounded-lg border",
              breached ? "border-danger-line bg-danger-soft text-danger" : "border-warning-line bg-warning-soft text-warning",
            )}
          >
            <MessageSquareWarning className="size-6" strokeWidth={1.75} />
          </span>
        }
        title={complaint.subject}
        identifier={complaint.id}
        chips={
          <>
            <StatusChip meta={caseStatus[complaint.status]} size="md" />
            <StatusChip meta={priorityMeta[complaint.priority]} />
          </>
        }
        facts={[
          {
            label: "Patient",
            value: patient ? (
              <Link href={`/patients/${patient.id}`} className="hover:text-primary">
                {patient.name}
              </Link>
            ) : (
              complaint.patientId
            ),
          },
          { label: "Department", value: departmentName(complaint.departmentId) },
          { label: "Opened", value: formatDate(complaint.openedAt) },
          {
            label: "SLA",
            value: isOpen ? (breached ? `Breached ${relativeDay(complaint.slaDueAt)}` : `Due ${relativeDay(complaint.slaDueAt)}`) : "Met",
          },
        ]}
        actions={
          isOpen ? (
            <>
              <Button size="sm" onClick={() => toast("Case resolved", { description: `${complaint.id} marked resolved.` })}>
                <CheckCircle2 className="size-3.5" strokeWidth={2.25} />
                Resolve
              </Button>
              <Button size="sm" variant="outline" onClick={() => toast("Reassigned")}>
                <UserCheck className="size-3.5" strokeWidth={2} />
                Reassign
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/inbox?compose=1">
                  <MessageSquare className="size-3.5" strokeWidth={2} />
                  Contact patient
                </Link>
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => toast("Case reopened")}>
              Reopen case
            </Button>
          )
        }
        tabs={[
          { id: "details", label: "Details" },
          { id: "activity", label: "Activity", count: events.length },
          { id: "resolution", label: "Resolution" },
        ]}
        activeTab={tab}
      />

      {breached && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2.5 text-body-sm text-danger">
          <MessageSquareWarning className="size-4 shrink-0" strokeWidth={2} />
          <span className="font-medium">This case has breached its resolution SLA. Prioritise it.</span>
        </div>
      )}

      {tab === "details" && (
        <Panel>
          <PanelHeader title="Complaint" description={`${complaint.type} · reported by ${patient?.name ?? "the patient"}`} />
          <PanelBody>
            <p className="text-body leading-6 text-ink-2 measure">{complaint.description}</p>
          </PanelBody>
        </Panel>
      )}

      {tab === "activity" && (
        <TabPanel title="Activity" description="Everything logged against this case.">
          <Spine events={events} />
        </TabPanel>
      )}

      {tab === "resolution" && (
        <Panel>
          <PanelHeader title="Resolution" />
          <PanelBody>
            {complaint.resolution ? (
              <div className="space-y-2">
                <p className="text-body leading-6 text-ink-2 measure">{complaint.resolution}</p>
                <p className="text-caption text-ink-3">Resolved by {staffName(complaint.ownerId)}.</p>
              </div>
            ) : (
              <EmptyState
                icon={CheckCircle2}
                title="Not resolved yet"
                description="Record the outcome here once the case is closed with the patient."
                compact
                action={<Button size="sm" onClick={() => toast("Resolution editor")}>Add resolution</Button>}
              />
            )}
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
