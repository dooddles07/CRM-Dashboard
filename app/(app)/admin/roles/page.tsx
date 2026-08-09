"use client";

import Link from "next/link";
import { Check, Eye, Minus, Pencil, Users } from "lucide-react";
import { PageHeader } from "@/components/data/page-header";
import { Panel } from "@/components/data/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Level = "full" | "edit" | "view" | "none";

const areas = ["Patients", "Appointments", "Pipeline", "Billing", "Reports", "Settings", "Users"] as const;

const matrix: { role: string; perms: Record<(typeof areas)[number], Level> }[] = [
  { role: "Super Admin", perms: { Patients: "full", Appointments: "full", Pipeline: "full", Billing: "full", Reports: "full", Settings: "full", Users: "full" } },
  { role: "Hospital Admin", perms: { Patients: "full", Appointments: "full", Pipeline: "full", Billing: "edit", Reports: "full", Settings: "edit", Users: "edit" } },
  { role: "Manager", perms: { Patients: "edit", Appointments: "edit", Pipeline: "full", Billing: "view", Reports: "full", Settings: "none", Users: "view" } },
  { role: "Doctor", perms: { Patients: "edit", Appointments: "edit", Pipeline: "none", Billing: "none", Reports: "view", Settings: "none", Users: "none" } },
  { role: "Nurse", perms: { Patients: "edit", Appointments: "view", Pipeline: "none", Billing: "none", Reports: "none", Settings: "none", Users: "none" } },
  { role: "Receptionist", perms: { Patients: "view", Appointments: "full", Pipeline: "view", Billing: "view", Reports: "none", Settings: "none", Users: "none" } },
  { role: "Patient Relations", perms: { Patients: "edit", Appointments: "edit", Pipeline: "full", Billing: "none", Reports: "view", Settings: "none", Users: "none" } },
  { role: "Marketing", perms: { Patients: "view", Appointments: "none", Pipeline: "full", Billing: "none", Reports: "view", Settings: "none", Users: "none" } },
  { role: "Billing", perms: { Patients: "view", Appointments: "view", Pipeline: "none", Billing: "full", Reports: "view", Settings: "none", Users: "none" } },
];

const levelMeta: Record<Level, { icon: typeof Check; className: string; label: string }> = {
  full: { icon: Check, className: "text-success", label: "Full access" },
  edit: { icon: Pencil, className: "text-info", label: "Edit" },
  view: { icon: Eye, className: "text-ink-3", label: "View only" },
  none: { icon: Minus, className: "text-line-strong", label: "No access" },
};

export default function AdminRolesPage() {
  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Roles & permissions"
        description="What each role can see and do. Nine roles across the seven areas of the product."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/users">
              <Users className="size-3.5" strokeWidth={2} />
              Back to users
            </Link>
          </Button>
        }
      />

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: "60rem" }}>
            <thead>
              <tr className="border-b border-line bg-surface-2">
                <th scope="col" className="sticky left-0 z-10 bg-surface-2 px-4 py-2.5 text-left text-label text-ink-3">
                  Role
                </th>
                {areas.map((a) => (
                  <th key={a} scope="col" className="px-3 py-2.5 text-center text-label text-ink-3">
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.role} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left text-body-sm font-medium text-ink">
                    {row.role}
                  </th>
                  {areas.map((a) => {
                    const meta = levelMeta[row.perms[a]];
                    const Icon = meta.icon;
                    return (
                      <td key={a} className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center justify-center" title={meta.label}>
                          <Icon className={cn("size-4", meta.className)} strokeWidth={2.25} aria-label={meta.label} />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-2.5">
          {(Object.keys(levelMeta) as Level[]).map((l) => {
            const meta = levelMeta[l];
            const Icon = meta.icon;
            return (
              <span key={l} className="inline-flex items-center gap-1.5 text-caption text-ink-3">
                <Icon className={cn("size-3.5", meta.className)} strokeWidth={2.25} />
                {meta.label}
              </span>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
