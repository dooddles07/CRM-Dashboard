"use client";

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CalendarPlus,
  MessageSquare,
  UserCheck,
  Waypoints,
} from "lucide-react";
import { toast } from "sonner";
import type { TimelineEvent } from "@/lib/types";
import { leadById } from "@/lib/data/pipeline";
import { staffById } from "@/lib/data/people";
import { departmentName, sourceLabels } from "@/lib/data/constants";
import { leadStage, priorityMeta } from "@/lib/status";
import { formatCurrency, formatDate, relativeDay } from "@/lib/format";
import { RecordHeader } from "@/components/record/record-header";
import { Spine } from "@/components/record/spine";
import { TabPanel } from "@/components/patient/tabs";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { StatusChip } from "@/components/healthcare/status-chip";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tab = useSearchParams().get("tab") ?? "overview";
  const lead = leadById(id);

  if (!lead) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState
          icon={Waypoints}
          title="We could not find that lead"
          description="It may have been converted, merged, or removed from the pipeline."
          reference={id}
          action={
            <Button size="sm" asChild>
              <Link href="/leads">Back to leads</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const owner = staffById(lead.ownerId);
  const events: TimelineEvent[] = [];
  events.push({
    id: `lt-created-${lead.id}`,
    subjectId: lead.id,
    kind: "record",
    title: "Lead created",
    detail: `Captured from ${sourceLabels[lead.source]}`,
    at: `${lead.createdAt}T09:00:00`,
    actor: owner?.name ?? null,
    tone: "neutral",
  });
  if (lead.lastContact) {
    events.push({
      id: `lt-contact-${lead.id}`,
      subjectId: lead.id,
      kind: "call",
      title: "Contacted",
      detail: lead.inquiry,
      at: lead.lastContact,
      actor: owner?.name ?? null,
      tone: "info",
    });
  }
  if (lead.nextFollowUp) {
    events.push({
      id: `lt-followup-${lead.id}`,
      subjectId: lead.id,
      kind: "follow-up",
      title: "Follow-up scheduled",
      detail: `Owner to check back in`,
      at: `${lead.nextFollowUp}T09:00:00`,
      actor: owner?.name ?? null,
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
        avatar={<PersonAvatar name={lead.name} id={lead.id} size="lg" initials={lead.initials} />}
        title={lead.name}
        identifier={lead.id}
        chips={
          <>
            <StatusChip meta={leadStage[lead.stage]} size="md" />
            <StatusChip meta={priorityMeta[lead.priority]} />
          </>
        }
        facts={[
          { label: "Interest", value: lead.interest },
          { label: "Source", value: sourceLabels[lead.source] },
          {
            label: "Owner",
            value: owner ? (
              <Link href={`/staff`} className="hover:text-primary">
                {owner.name}
              </Link>
            ) : (
              "Unassigned"
            ),
          },
          { label: "Estimated value", value: formatCurrency(lead.value) },
        ]}
        actions={
          <>
            <Button
              size="sm"
              onClick={() =>
                toast("Convert to patient", {
                  description: `${lead.name} would be registered as a new patient record.`,
                })
              }
            >
              <UserCheck className="size-3.5" strokeWidth={2.25} />
              Convert
            </Button>
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
              <p className="text-body leading-6 text-ink-2 measure">{lead.inquiry}</p>
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Details" />
            <PanelBody>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-body-sm">
                <Fact label="Department" value={departmentName(lead.departmentId)} />
                <Fact label="Stage" value={leadStage[lead.stage].label} />
                <Fact label="Created" value={formatDate(lead.createdAt)} />
                <Fact
                  label="Next follow-up"
                  value={lead.nextFollowUp ? relativeDay(lead.nextFollowUp) : "None"}
                />
                <Fact
                  label="Last contact"
                  value={lead.lastContact ? formatDate(lead.lastContact.slice(0, 10)) : "Not yet"}
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
