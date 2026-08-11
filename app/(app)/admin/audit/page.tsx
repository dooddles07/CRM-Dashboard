"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Download,
  Eye,
  FileDown,
  FilePlus2,
  LogIn,
  LogOut,
  PencilLine,
  ScrollText,
  ShieldAlert,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { AuditAction, AuditEntry, Tone } from "@/lib/types";
import { useCareflow } from "@/lib/store";
import { relativeTime } from "@/lib/format";
import { PageHeader } from "@/components/data/page-header";
import { DataTable } from "@/components/data/data-table";
import { StatusChip } from "@/components/healthcare/status-chip";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const actionMeta: Record<AuditAction, { label: string; tone: Tone; icon: LucideIcon }> = {
  viewed: { label: "Viewed", tone: "neutral", icon: Eye },
  revealed: { label: "Revealed", tone: "ai", icon: Eye },
  created: { label: "Created", tone: "success", icon: FilePlus2 },
  updated: { label: "Updated", tone: "info", icon: PencilLine },
  deleted: { label: "Deleted", tone: "danger", icon: Trash2 },
  exported: { label: "Exported", tone: "warning", icon: FileDown },
  "signed-in": { label: "Signed in", tone: "neutral", icon: LogIn },
  "signed-out": { label: "Signed out", tone: "neutral", icon: LogOut },
  locked: { label: "Locked", tone: "danger", icon: ShieldAlert },
};

export default function AuditPage() {
  const auditLog = useCareflow((s) => s.auditLog);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");

  const filtered = useMemo(() => {
    return auditLog.filter((e) => {
      if (action !== "all" && e.action !== action) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !e.actorName.toLowerCase().includes(q) &&
          !e.resource.toLowerCase().includes(q) &&
          !e.resourceId.toLowerCase().includes(q) &&
          !(e.field ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [auditLog, action, search]);

  const columns = useMemo<ColumnDef<AuditEntry, unknown>[]>(
    () => [
      {
        accessorKey: "timestamp",
        header: "When",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-ink-3 tabular-nums">{relativeTime(row.original.timestamp)}</span>
        ),
      },
      {
        id: "actor",
        header: "Actor",
        accessorFn: (e) => e.actorName,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <PersonAvatar name={row.original.actorName} id={row.original.actorId} size="xs" />
            <span className="whitespace-nowrap font-medium text-ink">{row.original.actorName}</span>
          </div>
        ),
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => <StatusChip meta={actionMeta[row.original.action]} />,
      },
      {
        id: "resource",
        header: "Resource",
        accessorFn: (e) => e.resource,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-ink">{row.original.resource}</p>
            <p className="text-ident text-ink-3">{row.original.resourceId}</p>
          </div>
        ),
      },
      {
        id: "change",
        header: "Detail",
        enableSorting: false,
        cell: ({ row }) => {
          const e = row.original;
          if (e.previousValue && e.newValue) {
            return (
              <span className="text-caption">
                <span className="text-ink-3 line-through">{e.previousValue}</span>{" "}
                <span className="text-ink">{e.newValue}</span>
              </span>
            );
          }
          return <span className="text-ink-3">{e.field ?? "—"}</span>;
        },
      },
      {
        id: "device",
        header: "Origin",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-0 text-caption text-ink-3">
            <p className="tabular-nums">{row.original.ip}</p>
            <p>{row.original.device}</p>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Audit log"
        description="Every sensitive action, recorded. Reveals and exports you make elsewhere in the app appear here."
        actions={
          <Button variant="outline" size="sm" onClick={() => toast("Audit export queued", { description: `${filtered.length} entries.` })}>
            <Download className="size-3.5" strokeWidth={2} />
            Export log
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(e) => e.id}
        pageSize={15}
        minWidth="76rem"
        empty={{
          icon: ScrollText,
          title: "No matching entries",
          description: "Adjust the filters to see more of the audit trail.",
        }}
        toolbar={() => (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" strokeWidth={2} />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Actor, resource, or field" aria-label="Search audit log" className="h-8 pl-8" />
            </div>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger size="sm" className="w-auto min-w-32" aria-label="Action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {(Object.keys(actionMeta) as AuditAction[]).map((a) => (
                  <SelectItem key={a} value={a}>
                    {actionMeta[a].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-auto hidden items-center gap-1.5 text-caption text-ink-3 sm:inline-flex">
              <ShieldAlert className="size-3.5" strokeWidth={2} />
              {filtered.length} entries
            </span>
          </div>
        )}
      />
    </div>
  );
}
