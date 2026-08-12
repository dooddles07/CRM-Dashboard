"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Handshake, Search } from "lucide-react";
import { toast } from "sonner";
import type { ReferralDTO } from "@/lib/server/services/referrals";
import { referralStatus } from "@/lib/status";
import { formatCurrency, formatDateShort, relativeDay } from "@/lib/format";
import { useCareflow } from "@/lib/store";
import { PageHeader } from "@/components/data/page-header";
import { DataTable } from "@/components/data/data-table";
import { StatusChip } from "@/components/healthcare/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const providerTypes = ["Clinic", "Physician", "Hospital", "Insurance"] as const;

export function ReferralsClient({ referrals }: { referrals: ReferralDTO[] }) {
  const logAudit = useCareflow((s) => s.logAudit);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [providerType, setProviderType] = useState("all");

  const filtered = useMemo(() => {
    return referrals.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (providerType !== "all" && r.providerType !== providerType) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.patientNameRaw.toLowerCase().includes(q) &&
          !r.provider.toLowerCase().includes(q) &&
          !r.reference.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [referrals, status, providerType, search]);

  const totalValue = filtered.reduce((s, r) => s + r.valueCents, 0);

  const columns = useMemo<ColumnDef<ReferralDTO, unknown>[]>(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => <span className="text-ident text-ink-3">{row.original.reference}</span>,
      },
      {
        accessorKey: "patientName",
        header: "Patient",
        cell: ({ row }) => <span className="whitespace-nowrap font-medium text-ink">{row.original.patientNameRaw}</span>,
      },
      {
        accessorKey: "provider",
        header: "Referred by",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-ink">{row.original.provider}</p>
            <p className="text-caption text-ink-3">{row.original.providerType}</p>
          </div>
        ),
      },
      {
        id: "department",
        header: "Department",
        accessorFn: (r) => (r.department?.name ?? "Unassigned"),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusChip meta={referralStatus[row.original.status]} />,
      },
      {
        id: "owner",
        header: "Owner",
        accessorFn: (r) => r.owner?.name ?? "",
      },
      {
        accessorKey: "receivedAt",
        header: "Received",
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {formatDateShort(row.original.receivedAt)}
            <span className="ml-1.5 text-caption text-ink-3">{relativeDay(row.original.receivedAt)}</span>
          </span>
        ),
      },
      {
        accessorKey: "value",
        header: "Value",
        cell: ({ row }) =>
          row.original.valueCents > 0 ? (
            <span className="font-medium text-ink tabular-nums">{formatCurrency(row.original.valueCents / 100)}</span>
          ) : (
            <span className="text-ink-3">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Referrals"
        description="Patients sent to the hospital by clinics, physicians, and insurers, and where each one stands."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              logAudit({
                action: "exported",
                resource: "Referrals",
                resourceId: `status:${status}`,
                field: `${filtered.length} records`,
                previousValue: null,
                newValue: null,
              });
              toast("Export queued", { description: `${filtered.length} referrals · recorded in the audit log.` });
            }}
          >
            <Download className="size-3.5" strokeWidth={2} />
            Export
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(r) => r.reference}
        pageSize={12}
        minWidth="72rem"
        empty={{
          icon: Handshake,
          title: "No referrals match",
          description: "Adjust the filters to see more of the referral pipeline.",
        }}
        toolbar={() => (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" strokeWidth={2} />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Patient, provider, or ID" aria-label="Search referrals" className="h-8 pl-8" />
            </div>
            <Select value={providerType} onValueChange={setProviderType}>
              <SelectTrigger size="sm" className="w-auto min-w-32" aria-label="Provider type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {providerTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger size="sm" className="w-auto min-w-32" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {Object.entries(referralStatus).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-auto hidden text-body-sm text-ink-3 sm:inline">
              Pipeline value{" "}
              <span className="font-medium text-ink tabular-nums">{formatCurrency(totalValue)}</span>
            </span>
          </div>
        )}
      />
    </div>
  );
}
