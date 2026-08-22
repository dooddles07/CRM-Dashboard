"use client";

import { useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, MessageSquare, Search, UserCheck } from "lucide-react";
import { toast } from "sonner";
import type { TimelineEvent, CaseStatus } from "@/lib/types";
import type { ComplaintDTO } from "@/lib/server/services/complaints";
import { updateComplaint, resolveComplaint } from "@/app/actions/complaints";
import { caseStatus, priorityMeta } from "@/lib/status";
import { formatDate, relativeDay } from "@/lib/format";
import { RecordHeader } from "@/components/record/record-header";
import { Spine } from "@/components/record/spine";
import { StatusChip } from "@/components/healthcare/status-chip";
import { TabPanel } from "@/components/patient/tabs";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { EmptyState } from "@/components/data/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const OPEN: CaseStatus[] = ["new", "assigned", "investigating", "waiting"];

interface OwnerOption {
  reference: string;
  name: string;
}

export function ComplaintRecordClient({
  complaint,
  owners,
}: {
  complaint: ComplaintDTO;
  owners: OwnerOption[];
}) {
  const router = useRouter();
  const tab = useSearchParams().get("tab") ?? "details";
  const [pending, startTransition] = useTransition();
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [ownerReference, setOwnerReference] = useState(complaint.owner?.reference ?? "");

  const isOpen = OPEN.includes(complaint.status);

  function advance(status: CaseStatus) {
    startTransition(async () => {
      const result = await updateComplaint(complaint.reference, { status });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast(caseStatus[status].label, { description: complaint.reference });
      router.refresh();
    });
  }

  function assignOrReassign() {
    if (!ownerReference) {
      toast.error("Choose an owner first.");
      return;
    }
    startTransition(async () => {
      const result = await updateComplaint(complaint.reference, {
        ownerReference,
        status: complaint.status === "new" ? "assigned" : undefined,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setReassignOpen(false);
      toast("Case assigned", { description: complaint.reference });
      router.refresh();
    });
  }

  function resolve() {
    if (!resolution.trim()) {
      toast.error("Add a resolution note first.");
      return;
    }
    startTransition(async () => {
      const result = await resolveComplaint(complaint.reference, resolution.trim());
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setResolveOpen(false);
      toast("Case resolved", { description: complaint.reference });
      router.refresh();
    });
  }

  const events: TimelineEvent[] = [
    {
      id: `ct-opened-${complaint.reference}`,
      subjectId: complaint.reference,
      kind: "complaint",
      title: "Case opened",
      detail: complaint.subject,
      at: complaint.openedAt,
      actor: complaint.patient.name,
      tone: "danger",
    },
  ];
  if (complaint.owner) {
    events.push({
      id: `ct-assigned-${complaint.reference}`,
      subjectId: complaint.reference,
      kind: "task",
      title: `Assigned to ${complaint.owner.name}`,
      detail: `${complaint.type} · ${complaint.department?.name ?? "Unassigned"}`,
      at: complaint.openedAt,
      actor: null,
      tone: "info",
    });
  }
  if (complaint.resolvedAt) {
    events.unshift({
      id: `ct-resolved-${complaint.reference}`,
      subjectId: complaint.reference,
      kind: "record",
      title: complaint.status === "closed" ? "Case closed" : "Case resolved",
      detail: complaint.resolution,
      at: complaint.resolvedAt,
      actor: complaint.owner?.name ?? null,
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
              complaint.breached ? "border-danger-line bg-danger-soft text-danger" : "border-warning-line bg-warning-soft text-warning",
            )}
          >
            <Search className="size-6" strokeWidth={1.75} />
          </span>
        }
        title={complaint.subject}
        identifier={complaint.reference}
        chips={
          <>
            <StatusChip meta={caseStatus[complaint.status]} size="md" />
            <StatusChip meta={priorityMeta[complaint.priority]} />
          </>
        }
        facts={[
          {
            label: "Patient",
            value: (
              <Link href={`/patients/${complaint.patient.reference}`} className="hover:text-primary">
                {complaint.patient.name}
              </Link>
            ),
          },
          { label: "Department", value: complaint.department?.name ?? "Unassigned" },
          { label: "Opened", value: formatDate(complaint.openedAt) },
          {
            label: "SLA",
            value: complaint.resolvedAt
              ? "Met"
              : complaint.breached
                ? `Breached ${relativeDay(complaint.slaDueAt)}`
                : `Due ${relativeDay(complaint.slaDueAt)}`,
          },
        ]}
        actions={
          isOpen ? (
            <>
              {complaint.status === "assigned" && (
                <Button size="sm" disabled={pending} onClick={() => advance("investigating")}>
                  <Search className="size-3.5" strokeWidth={2.25} />
                  Start investigating
                </Button>
              )}

              {(complaint.status === "investigating" || complaint.status === "waiting") && (
                <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <CheckCircle2 className="size-3.5" strokeWidth={2.25} />
                      Resolve
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Resolve {complaint.reference}</DialogTitle>
                      <DialogDescription>Stops the SLA clock and records the outcome.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1.5 py-1">
                      <Label htmlFor="resolution">Resolution</Label>
                      <Textarea
                        id="resolution"
                        rows={4}
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        placeholder="What was done to resolve this case?"
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" size="sm" onClick={() => setResolveOpen(false)} disabled={pending}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={resolve} disabled={pending}>
                        {pending ? "Saving…" : "Resolve"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <UserCheck className="size-3.5" strokeWidth={2} />
                    {complaint.status === "new" ? "Assign" : "Reassign"}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {complaint.status === "new" ? "Assign" : "Reassign"} {complaint.reference}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-1.5 py-1">
                    <Label htmlFor="owner">Owner</Label>
                    <Select value={ownerReference} onValueChange={setOwnerReference}>
                      <SelectTrigger id="owner" className="w-full">
                        <SelectValue placeholder="Choose an owner" />
                      </SelectTrigger>
                      <SelectContent>
                        {owners.map((o) => (
                          <SelectItem key={o.reference} value={o.reference}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => setReassignOpen(false)} disabled={pending}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={assignOrReassign} disabled={pending}>
                      {pending ? "Saving…" : "Save"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button size="sm" variant="outline" asChild>
                <Link href="/inbox?compose=1">
                  <MessageSquare className="size-3.5" strokeWidth={2} />
                  Contact patient
                </Link>
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={pending} onClick={() => advance("closed")}>
              Close case
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

      {complaint.breached && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2.5 text-body-sm text-danger">
          <Search className="size-4 shrink-0" strokeWidth={2} />
          <span className="font-medium">This case has breached its resolution SLA. Prioritise it.</span>
        </div>
      )}

      {tab === "details" && (
        <Panel>
          <PanelHeader title="Complaint" description={`${complaint.type} · reported by ${complaint.patient.name}`} />
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
                {complaint.owner && (
                  <p className="text-caption text-ink-3">Resolved by {complaint.owner.name}.</p>
                )}
              </div>
            ) : (
              <EmptyState
                icon={CheckCircle2}
                title="Not resolved yet"
                description="Resolve the case from the actions above to record the outcome here."
                compact
              />
            )}
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
