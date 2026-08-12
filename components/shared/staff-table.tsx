"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Contact, MoreHorizontal, Search, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import type { StaffRole } from "@/lib/types";
import type { StaffDTO } from "@/lib/server/services/directory";
import { relativeTime } from "@/lib/format";
import { userStatus } from "@/lib/status";
import { DataTable, selectionColumn } from "@/components/data/data-table";
import { StatusChip } from "@/components/healthcare/status-chip";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const roles: StaffRole[] = [
  "Super Admin",
  "Hospital Admin",
  "Doctor",
  "Nurse",
  "Receptionist",
  "Patient Relations",
  "Marketing",
  "Billing",
  "Manager",
];

export function StaffTable({
  data,
  manage = false,
}: {
  data: StaffDTO[];
  /** Adds selection, role, MFA columns and a row actions menu (admin view). */
  manage?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    return data.filter((s) => {
      if (role !== "all" && s.role !== role) return false;
      if (status !== "all" && s.status !== status) return false;
      if (search) {
        const q = search.toLowerCase();
        // Email is masked on the DTO — only the domain survives — so it is
        // no longer searchable. Matching a masked string would silently find
        // nothing, which is worse than not offering it.
        if (!s.name.toLowerCase().includes(q) && !s.role.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [data, role, status, search]);

  const columns = useMemo<ColumnDef<StaffDTO, unknown>[]>(() => {
    const cols: ColumnDef<StaffDTO, unknown>[] = [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <PersonAvatar name={row.original.name} id={row.original.reference} size="xs" initials={row.original.initials} />
            <div className="min-w-0">
              <p className="whitespace-nowrap font-medium text-ink">{row.original.name}</p>
              <p className="text-caption text-ink-3">{row.original.email.masked}</p>
            </div>
          </div>
        ),
      },
      { accessorKey: "role", header: "Role" },
      {
        id: "department",
        header: "Department",
        accessorFn: (s) => s.department?.name ?? "—",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-ink-2">
            {row.original.department?.name ?? "Hospital-wide"}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusChip meta={userStatus[row.original.status]} />,
      },
      {
        accessorKey: "mfaEnabled",
        header: "MFA",
        cell: ({ row }) =>
          row.original.mfaEnabled ? (
            <span className="inline-flex items-center gap-1 text-caption text-success">
              <ShieldCheck className="size-3.5" strokeWidth={2} />
              On
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-caption text-danger">
              <ShieldOff className="size-3.5" strokeWidth={2} />
              Off
            </span>
          ),
      },
      {
        accessorKey: "lastActiveAt",
        header: "Last active",
        cell: ({ row }) => <span className="whitespace-nowrap text-ink-3">
            {row.original.lastActiveAt ? relativeTime(row.original.lastActiveAt) : "Never"}
          </span>,
      },
    ];

    if (manage) {
      cols.unshift(selectionColumn<StaffDTO>("users"));
      cols.push({
        id: "actions",
        header: "",
        size: 44,
        enableSorting: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.name}`}>
                <MoreHorizontal className="size-4" strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => toast("Edit role", { description: `${row.original.name} · role change opens here.` })}>
                Change role
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toast("MFA reset link sent")}>Reset MFA</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toast("Password reset email sent")}>Reset password</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => toast(`${row.original.name} suspended`)}>
                Suspend account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      });
    }

    return cols;
  }, [manage]);

  return (
    <DataTable
      columns={columns}
      data={filtered}
      getRowId={(s) => s.reference}
      pageSize={12}
      minWidth={manage ? "72rem" : "64rem"}
      empty={{
        icon: Contact,
        title: "No people match",
        description: "Adjust the search or filters to see the team.",
      }}
      toolbar={() => (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" strokeWidth={2} />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or role" aria-label="Search staff by name or role" className="h-8 pl-8" />
          </div>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger size="sm" className="w-auto min-w-36" aria-label="Role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger size="sm" className="w-auto min-w-28" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {Object.entries(userStatus).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    />
  );
}
