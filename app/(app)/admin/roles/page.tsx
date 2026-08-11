import Link from "next/link";
import { Check, Eye, Minus, Pencil, Users, X } from "lucide-react";
import { PageHeader } from "@/components/data/page-header";
import { Panel, PanelHeader } from "@/components/data/panel";
import { Button } from "@/components/ui/button";
import {
  AREAS,
  AREA_LABELS,
  CAPABILITIES,
  type Capability,
  DEPARTMENT_SCOPE,
  type Level,
  ROLES,
  ROLE_CAPABILITIES,
  ROLE_MATRIX,
} from "@/lib/server/authz/matrix";
import { cn } from "@/lib/utils";

/**
 * plan/03-authorisation.md §1: "The screen keeps rendering this table. It
 * stops holding the data, and imports it from `lib/server/authz/matrix.ts`
 * instead, so the page and the enforcement can never disagree."
 *
 * A Server Component now, where it used to be `"use client"`. It has no
 * state and no handlers, so the directive was never buying anything, and
 * dropping it is what lets the page import from `lib/server/` at all —
 * this module is the same one `assert()` reads, not a copy shipped to the
 * browser.
 *
 * The second panel is not in plan §1's scope. It is here because §2's three
 * capabilities are the part of the policy the levels grid cannot express:
 * without it this screen tells an administrator that Marketing holds
 * `Patients: view` and nothing tells them Marketing cannot reveal a phone
 * number, which is the specific control this phase exists to enforce.
 */
const levelMeta: Record<Level, { icon: typeof Check; className: string; label: string }> = {
  full: { icon: Check, className: "text-success", label: "Full access" },
  edit: { icon: Pencil, className: "text-info", label: "Edit" },
  view: { icon: Eye, className: "text-ink-3", label: "View only" },
  none: { icon: Minus, className: "text-line-strong", label: "No access" },
};

const capabilityMeta: Record<Capability, { label: string; description: string }> = {
  reveal: { label: "Reveal", description: "Unmask a patient's contact details" },
  export: { label: "Export", description: "Download records in bulk" },
  "audit:read": { label: "Audit log", description: "Read /admin/audit" },
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
                {AREAS.map((area) => (
                  <th key={area} scope="col" className="px-3 py-2.5 text-center text-label text-ink-3">
                    {AREA_LABELS[area]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLES.map((role) => (
                <tr key={role} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left text-body-sm font-medium text-ink">
                    {role}
                  </th>
                  {AREAS.map((area) => {
                    const meta = levelMeta[ROLE_MATRIX[role][area]];
                    const Icon = meta.icon;
                    return (
                      <td key={area} className="px-3 py-2.5 text-center">
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

      <div className="mt-4">
        <Panel>
          <PanelHeader
            title="Beyond the grid"
            description="Three operations are granted separately, because access level alone is the wrong question for them. Department scope decides whose records a role sees at all."
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: "44rem" }}>
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  <th scope="col" className="sticky left-0 z-10 bg-surface-2 px-4 py-2.5 text-left text-label text-ink-3">
                    Role
                  </th>
                  {CAPABILITIES.map((capability) => (
                    <th
                      key={capability}
                      scope="col"
                      className="px-3 py-2.5 text-center text-label text-ink-3"
                      title={capabilityMeta[capability].description}
                    >
                      {capabilityMeta[capability].label}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-2.5 text-right text-label text-ink-3">
                    Sees
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROLES.map((role) => (
                  <tr key={role} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left text-body-sm font-medium text-ink">
                      {role}
                    </th>
                    {CAPABILITIES.map((capability) => {
                      const granted = ROLE_CAPABILITIES[role].includes(capability);
                      const Icon = granted ? Check : X;
                      const label = `${granted ? "Can" : "Cannot"} ${capabilityMeta[capability].label.toLowerCase()}`;
                      return (
                        <td key={capability} className="px-3 py-2.5 text-center">
                          <span className="inline-flex items-center justify-center" title={label}>
                            <Icon
                              className={cn("size-4", granted ? "text-success" : "text-line-strong")}
                              strokeWidth={2.25}
                              aria-label={label}
                            />
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-right text-body-sm text-ink-2">
                      {DEPARTMENT_SCOPE[role] === "all" ? "All departments" : "Own department"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-2.5 text-caption text-ink-3">
            Marketing and Billing hold <span className="font-medium text-ink-2">Patients: view</span> but cannot reveal:
            both work on aggregates, and neither needs an individual contact detail. An export of contact columns
            requires Reveal as well, and every exported row counts against the same hourly reveal budget.
          </p>
        </Panel>
      </div>
    </div>
  );
}
