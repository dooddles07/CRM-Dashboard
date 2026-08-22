"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, MessageSquare, UserCheck } from "lucide-react";
import { toast } from "sonner";
import type { TimelineEvent } from "@/lib/types";
import type { LeadDTO } from "@/lib/server/services/leads";
import { createPatient } from "@/app/actions/patients";
import { convertLead } from "@/app/actions/pipeline";
import { leadStage, priorityMeta } from "@/lib/status";
import { sourceLabels } from "@/lib/labels";
import { formatCurrency, formatDate, relativeDay } from "@/lib/format";
import { RecordHeader } from "@/components/record/record-header";
import { Spine } from "@/components/record/spine";
import { TabPanel } from "@/components/patient/tabs";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { StatusChip } from "@/components/healthcare/status-chip";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface DepartmentOption {
  id: string;
  name: string;
}

interface LeadRecordClientProps {
  lead: LeadDTO;
  history: { from: string | null; to: string; at: string; by: string | null }[];
  departments: DepartmentOption[];
}

export function LeadRecordClient({ lead, history, departments }: LeadRecordClientProps) {
  const tab = useSearchParams().get("tab") ?? "overview";

  const events: TimelineEvent[] = [];
  events.push({
    id: `lt-created-${lead.reference}`,
    subjectId: lead.reference,
    kind: "record",
    title: "Lead created",
    detail: `Captured from ${sourceLabels[lead.source as keyof typeof sourceLabels] ?? lead.source}`,
    at: lead.createdAt,
    actor: lead.owner?.name ?? null,
    tone: "neutral",
  });
  for (const move of history) {
    events.push({
      id: `lt-stage-${lead.reference}-${move.at}`,
      subjectId: lead.reference,
      kind: "record",
      title: move.from ? `Stage: ${leadStage[move.from as keyof typeof leadStage]?.label ?? move.from} → ${leadStage[move.to as keyof typeof leadStage]?.label ?? move.to}` : `Stage set to ${leadStage[move.to as keyof typeof leadStage]?.label ?? move.to}`,
      detail: null,
      at: move.at,
      actor: move.by,
      tone: "info",
    });
  }
  if (lead.lastContactAt) {
    events.push({
      id: `lt-contact-${lead.reference}`,
      subjectId: lead.reference,
      kind: "call",
      title: "Contacted",
      detail: lead.inquiry,
      at: lead.lastContactAt,
      actor: lead.owner?.name ?? null,
      tone: "info",
    });
  }
  if (lead.nextFollowUp) {
    events.push({
      id: `lt-followup-${lead.reference}`,
      subjectId: lead.reference,
      kind: "follow-up",
      title: "Follow-up scheduled",
      detail: "Owner to check back in",
      at: `${lead.nextFollowUp}T09:00:00`,
      actor: lead.owner?.name ?? null,
      tone: "warning",
    });
  }
  events.sort((a, b) => (a.at < b.at ? 1 : -1));

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "activity", label: "Activity", count: events.length },
  ];

  return (
    <div className="mx-auto max-w-[100rem]">
      <RecordHeader
        breadcrumb={{ label: "Leads", href: "/leads" }}
        avatar={<PersonAvatar name={lead.name} id={lead.reference} size="lg" />}
        title={lead.name}
        identifier={lead.reference}
        chips={
          <>
            <StatusChip meta={leadStage[lead.stage]} size="md" />
            <StatusChip meta={priorityMeta[lead.priority]} />
          </>
        }
        facts={[
          { label: "Interest", value: lead.interest ?? "Not provided" },
          { label: "Source", value: sourceLabels[lead.source as keyof typeof sourceLabels] ?? lead.source },
          {
            label: "Owner",
            value: lead.owner ? (
              <Link href="/staff" className="hover:text-primary">
                {lead.owner.name}
              </Link>
            ) : (
              "Unassigned"
            ),
          },
          { label: "Estimated value", value: formatCurrency(lead.valueCents / 100) },
        ]}
        actions={
          <>
            {lead.stage === "converted" ? (
              lead.convertedPatientReference && (
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/patients/${lead.convertedPatientReference}`}>
                    <UserCheck className="size-3.5" strokeWidth={2.25} />
                    View patient
                  </Link>
                </Button>
              )
            ) : (
              <ConvertLeadDialog lead={lead} departments={departments} />
            )}
            <Button size="sm" variant="outline" asChild>
              <Link href="/appointments?create=1">
                <CalendarPlus className="size-3.5" strokeWidth={2} />
                Book
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/inbox?compose=1">
                <MessageSquare className="size-3.5" strokeWidth={2} />
                Message
              </Link>
            </Button>
          </>
        }
        tabs={tabs}
        activeTab={tab}
      />

      {tab === "overview" && (
        <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          <Panel className="lg:col-span-2">
            <PanelHeader title="Enquiry" />
            <PanelBody>
              <p className="text-body leading-6 text-ink-2 measure">{lead.inquiry ?? "No enquiry notes recorded."}</p>
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Details" />
            <PanelBody>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-body-sm">
                <Fact label="Department" value={lead.department?.name ?? "Unassigned"} />
                <Fact label="Stage" value={leadStage[lead.stage].label} />
                <Fact label="Created" value={formatDate(lead.createdAt)} />
                <Fact
                  label="Next follow-up"
                  value={lead.nextFollowUp ? relativeDay(lead.nextFollowUp) : "None"}
                />
                <Fact
                  label="Last contact"
                  value={lead.lastContactAt ? formatDate(lead.lastContactAt.slice(0, 10)) : "Not yet"}
                />
                <Fact label="Priority" value={priorityMeta[lead.priority].label} />
              </dl>
            </PanelBody>
          </Panel>
        </div>
      )}

      {tab === "activity" && (
        <TabPanel title="Activity" description="Everything logged against this lead, most recent first.">
          <Spine events={events} />
        </TabPanel>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-label text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}

/**
 * plan §7: the patient is created through its own flow (plaintext in, this
 * form) — conversion only links the reference it returns. Collects just the
 * fields `newPatientSchema` requires beyond what the lead already carries.
 */
function ConvertLeadDialog({ lead, departments }: { lead: LeadDTO; departments: DepartmentOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("Female");
  const [departmentId, setDepartmentId] = useState(lead.department?.id ?? "");

  function convert() {
    if (!phone.trim() || !dateOfBirth) {
      toast.error("A mobile number and date of birth are required.");
      return;
    }

    startTransition(async () => {
      const created = await createPatient({
        name: lead.name,
        phone: phone.trim(),
        email: email.trim() || null,
        dateOfBirth,
        gender,
        departmentId: departmentId || null,
        source: lead.source,
        notes: lead.inquiry,
      });
      if (!created.ok) {
        toast.error(created.message);
        return;
      }

      const linked = await convertLead(lead.reference, created.data.reference);
      if (!linked.ok) {
        // The patient was already created and is a real, valid record —
        // archiving it back out would need `patients:full`, which the
        // roles that actually do conversions (Marketing, Patient Relations)
        // don't hold. Naming it here instead, so a retry doesn't create a
        // second patient for the same person.
        toast.error(
          `${linked.message} A patient record (${created.data.reference}) was already created — check it before converting again.`,
        );
        return;
      }

      setOpen(false);
      toast("Lead converted", { description: `${lead.name} is now ${created.data.reference}.` });
      router.push(`/patients/${created.data.reference}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserCheck className="size-3.5" strokeWidth={2.25} />
          Convert
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert {lead.name} to a patient</DialogTitle>
          <DialogDescription>
            Creates a patient record and links this lead to it. The name, department, source, and
            enquiry carry over automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cv-phone">Mobile number</Label>
              <Input id="cv-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+63" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cv-dob">Date of birth</Label>
              <Input id="cv-dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cv-gender">Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger id="cv-gender" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cv-dept">Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger id="cv-dept" className="w-full">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cv-email">Email (optional)</Label>
            <Input id="cv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" onClick={convert} disabled={pending}>
            {pending ? "Converting…" : "Convert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
