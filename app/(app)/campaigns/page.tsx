"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Megaphone, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { Campaign } from "@/lib/types";
import { campaigns } from "@/lib/data/marketing";
import { campaignStatus } from "@/lib/status";
import { formatNumber, formatDateShort } from "@/lib/format";
import { PageHeader } from "@/components/data/page-header";
import { DataTable } from "@/components/data/data-table";
import { StatusChip } from "@/components/healthcare/status-chip";
import { ParamDialog, Field } from "@/components/shared/create-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));

export default function CampaignsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const running = campaigns.filter((c) => c.status === "running").length;
  const appointmentsDriven = campaigns.reduce((s, c) => s + c.appointments, 0);
  const totalDelivered = campaigns.reduce((s, c) => s + c.delivered, 0);
  const totalOpened = campaigns.reduce((s, c) => s + c.opened, 0);
  const avgOpen = pct(totalOpened, totalDelivered);

  const kpis = [
    { label: "Running", value: `${running}`, sub: "active campaigns" },
    { label: "Appointments driven", value: formatNumber(appointmentsDriven), sub: "all campaigns" },
    { label: "Average open rate", value: `${avgOpen}%`, sub: "of delivered" },
    { label: "Campaigns", value: `${campaigns.length}`, sub: "total" },
  ];

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [status, search]);

  const columns = useMemo<ColumnDef<Campaign, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Campaign",
        cell: ({ row }) => (
          <Link
            href={`/campaigns/${row.original.id}`}
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 font-medium text-ink hover:text-primary"
          >
            <p className="truncate">{row.original.name}</p>
            <p className="text-caption text-ink-3">{row.original.type} · {row.original.channel.toUpperCase()}</p>
          </Link>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusChip meta={campaignStatus[row.original.status]} />,
      },
      {
        accessorKey: "audienceSize",
        header: "Audience",
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.audienceSize)}</span>,
      },
      {
        id: "delivered",
        header: "Delivered",
        accessorFn: (c) => c.delivered,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatNumber(row.original.delivered)}
            {row.original.sent > 0 && (
              <span className="ml-1 text-caption text-ink-3">{pct(row.original.delivered, row.original.sent)}%</span>
            )}
          </span>
        ),
      },
      {
        id: "opened",
        header: "Open rate",
        accessorFn: (c) => pct(c.opened, c.delivered),
        cell: ({ row }) => <span className="tabular-nums">{pct(row.original.opened, row.original.delivered)}%</span>,
      },
      {
        accessorKey: "appointments",
        header: "Appointments",
        cell: ({ row }) => (
          <span className="font-medium text-ink tabular-nums">{formatNumber(row.original.appointments)}</span>
        ),
      },
      {
        accessorKey: "startedAt",
        header: "Start",
        cell: ({ row }) => <span className="whitespace-nowrap text-ink-3">{formatDateShort(row.original.startedAt)}</span>,
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Campaigns"
        description="Outreach that brings patients back — reminders, screenings, and re-engagement."
        actions={
          <Button size="sm" asChild>
            <Link href="/campaigns?create=1">
              <Plus className="size-3.5" strokeWidth={2.5} />
              New campaign
            </Link>
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-line bg-surface p-3 shadow-card">
            <p className="text-label text-ink-3">{k.label}</p>
            <p className="mt-1.5 text-[1.5rem] font-semibold leading-7 text-ink tabular-nums">{k.value}</p>
            <p className="mt-0.5 text-caption text-ink-3">{k.sub}</p>
          </div>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(c) => c.id}
        onRowClick={(c) => router.push(`/campaigns/${c.id}`)}
        pageSize={10}
        minWidth="72rem"
        empty={{
          icon: Megaphone,
          title: "No campaigns match",
          description: "Adjust the filters, or launch a campaign to reach a patient segment.",
        }}
        toolbar={() => (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" strokeWidth={2} />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaigns" aria-label="Search campaigns" className="h-8 pl-8" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger size="sm" className="w-auto min-w-28" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {Object.entries(campaignStatus).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      />

      <NewCampaignDialog />
    </div>
  );
}

function NewCampaignDialog() {
  const [name, setName] = useState("");
  return (
    <ParamDialog
      title="New campaign"
      description="Draft an outreach campaign. In this demo it is not persisted."
      submitLabel="Create draft"
      onSubmit={() => {
        if (!name.trim()) {
          toast("Name the campaign first");
          return false;
        }
        toast("Campaign drafted", { description: `${name} saved as a draft.` });
      }}
    >
      <Field label="Name" htmlFor="cp-name">
        <Input id="cp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" htmlFor="cp-type">
          <Select defaultValue="Annual checkup">
            <SelectTrigger id="cp-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Annual checkup", "Vaccination reminder", "Health screening", "Wellness", "Follow-up", "Re-engagement"].map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Channel" htmlFor="cp-channel">
          <Select defaultValue="email">
            <SelectTrigger id="cp-channel" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["sms", "email", "whatsapp"].map((c) => (
                <SelectItem key={c} value={c}>
                  {c.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </ParamDialog>
  );
}
