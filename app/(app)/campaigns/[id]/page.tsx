"use client";

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Megaphone, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { campaignById } from "@/lib/data/marketing";
import { campaignStatus } from "@/lib/status";
import { formatNumber, formatDate } from "@/lib/format";
import { RecordHeader } from "@/components/record/record-header";
import { TabPanel } from "@/components/patient/tabs";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tab = useSearchParams().get("tab") ?? "performance";
  const campaign = campaignById(id);

  if (!campaign) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState
          icon={Megaphone}
          title="We could not find that campaign"
          description="It may have been archived or removed."
          reference={id}
          action={
            <Button size="sm" asChild>
              <Link href="/campaigns">Back to campaigns</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const funnel = [
    { label: "Sent", value: campaign.sent },
    { label: "Delivered", value: campaign.delivered },
    { label: "Opened", value: campaign.opened },
    { label: "Clicked", value: campaign.clicked },
    { label: "Appointments", value: campaign.appointments },
  ];
  const top = campaign.sent || campaign.audienceSize || 1;

  const running = campaign.status === "running";

  return (
    <div className="mx-auto max-w-[100rem]">
      <RecordHeader
        breadcrumb={{ label: "Campaigns", href: "/campaigns" }}
        avatar={
          <span className="inline-flex size-12 items-center justify-center rounded-lg border border-info-line bg-info-soft text-info">
            <Megaphone className="size-6" strokeWidth={1.75} />
          </span>
        }
        title={campaign.name}
        identifier={`${campaign.type} · ${campaign.channel.toUpperCase()}`}
        chips={<StatusPill status={campaign.status} />}
        facts={[
          { label: "Audience", value: `${formatNumber(campaign.audienceSize)} patients` },
          { label: "Started", value: formatDate(campaign.startedAt) },
          { label: "Appointments", value: formatNumber(campaign.appointments) },
          { label: "Segment", value: campaign.audience },
        ]}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => toast(running ? "Campaign paused" : "Campaign resumed")}
          >
            {running ? <Pause className="size-3.5" strokeWidth={2} /> : <Play className="size-3.5" strokeWidth={2} />}
            {running ? "Pause" : "Resume"}
          </Button>
        }
        tabs={[
          { id: "performance", label: "Performance" },
          { id: "audience", label: "Audience" },
        ]}
        activeTab={tab}
      />

      {tab === "performance" && (
        <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          <Panel className="lg:col-span-2">
            <PanelHeader title="Delivery funnel" description="From messages sent to appointments booked." />
            <PanelBody>
              <ol className="space-y-3">
                {funnel.map((s, i) => {
                  const width = Math.max((s.value / top) * 100, 1.5);
                  const prev = i === 0 ? null : funnel[i - 1].value;
                  const rate = prev && prev > 0 ? Math.round((s.value / prev) * 100) : null;
                  return (
                    <li key={s.label}>
                      <div className="flex items-baseline justify-between gap-3 text-body-sm">
                        <span className="text-ink-2">{s.label}</span>
                        <span className="flex items-baseline gap-2">
                          <span className="font-medium text-ink tabular-nums">{formatNumber(s.value)}</span>
                          {rate !== null && <span className="w-12 text-right text-caption text-ink-3 tabular-nums">{rate}%</span>}
                        </span>
                      </div>
                      <div className="mt-1 h-2.5 w-full rounded-full bg-surface-3">
                        <div className="h-2.5 rounded-full bg-primary transition-[width] duration-300" style={{ width: `${width}%`, opacity: 1 - i * 0.13 }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Rates" />
            <PanelBody className="space-y-3">
              <Rate label="Delivery rate" a={campaign.delivered} b={campaign.sent} />
              <Rate label="Open rate" a={campaign.opened} b={campaign.delivered} />
              <Rate label="Click rate" a={campaign.clicked} b={campaign.opened} />
              <Rate label="Booking rate" a={campaign.appointments} b={campaign.delivered} />
            </PanelBody>
          </Panel>
        </div>
      )}

      {tab === "audience" && (
        <TabPanel title="Audience" description="Who this campaign targets.">
          <div className="px-4 py-4">
            <p className="text-body text-ink-2 measure">{campaign.audience}</p>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-label text-ink-3">Audience size</dt>
                <dd className="mt-1 text-h2 text-ink tabular-nums">{formatNumber(campaign.audienceSize)}</dd>
              </div>
              <div>
                <dt className="text-label text-ink-3">Channel</dt>
                <dd className="mt-1 text-h2 text-ink">{campaign.channel.toUpperCase()}</dd>
              </div>
              <div>
                <dt className="text-label text-ink-3">Reached</dt>
                <dd className="mt-1 text-h2 text-ink tabular-nums">{formatNumber(campaign.delivered)}</dd>
              </div>
              <div>
                <dt className="text-label text-ink-3">Converted</dt>
                <dd className="mt-1 text-h2 text-ink tabular-nums">{formatNumber(campaign.appointments)}</dd>
              </div>
            </dl>
          </div>
        </TabPanel>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const meta = campaignStatus[status];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-body-sm font-medium",
      "bg-surface-2 border-line text-ink-2")}>
      <meta.icon className="size-3.5" strokeWidth={2.25} />
      {meta.label}
    </span>
  );
}

function Rate({ label, a, b }: { label: string; a: number; b: number }) {
  const pct = b === 0 ? 0 : Math.round((a / b) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-body-sm">
        <span className="text-ink-3">{label}</span>
        <span className="font-medium text-ink tabular-nums">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-surface-3">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
