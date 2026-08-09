"use client";

import { useState } from "react";
import { KeyRound, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { staff } from "@/lib/data/people";
import { useCareflow } from "@/lib/store";
import { relativeTime } from "@/lib/format";
import { PageHeader } from "@/components/data/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const SENSITIVE = new Set(["revealed", "exported", "signed-in", "deleted"]);

export default function SecurityPage() {
  const auditLog = useCareflow((s) => s.auditLog);
  const [policies, setPolicies] = useState({
    mfaRequired: true,
    strongPasswords: true,
    ipAllowlist: false,
    autoLogout: true,
  });

  const withMfa = staff.filter((s) => s.mfaEnabled).length;
  const withoutMfa = staff.filter((s) => !s.mfaEnabled && s.status === "active");
  const coverage = Math.round((withMfa / staff.length) * 100);

  const sensitive = auditLog.filter((e) => SENSITIVE.has(e.action)).slice(0, 8);

  const kpis = [
    { label: "MFA coverage", value: `${coverage}%`, tone: coverage >= 90 ? "success" : "warning" },
    { label: "Active accounts", value: `${staff.filter((s) => s.status === "active").length}` },
    { label: "Without MFA", value: `${withoutMfa.length}`, tone: withoutMfa.length > 0 ? "danger" : "success" },
    { label: "Suspended", value: `${staff.filter((s) => s.status === "suspended").length}` },
  ];

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Security"
        description="Access controls, multi-factor coverage, and a trail of the most sensitive recent activity."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-line bg-surface p-3 shadow-card">
            <p className="text-label text-ink-3">{k.label}</p>
            <p
              className={
                "mt-1.5 text-[1.5rem] font-semibold leading-7 tabular-nums " +
                (k.tone === "danger" ? "text-danger" : k.tone === "warning" ? "text-warning" : k.tone === "success" ? "text-success" : "text-ink")
              }
            >
              {k.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Panel>
          <PanelHeader title="Policies" description="Hospital-wide security requirements." />
          <PanelBody className="space-y-1">
            <PolicyRow
              label="Require MFA for all staff"
              hint="New accounts must enrol on first sign-in"
              checked={policies.mfaRequired}
              onChange={(v) => {
                setPolicies((p) => ({ ...p, mfaRequired: v }));
                toast(v ? "MFA now required" : "MFA requirement relaxed");
              }}
            />
            <PolicyRow
              label="Strong password policy"
              hint="12+ characters, mixed case, symbol"
              checked={policies.strongPasswords}
              onChange={(v) => setPolicies((p) => ({ ...p, strongPasswords: v }))}
            />
            <PolicyRow
              label="IP allowlist"
              hint="Restrict access to hospital networks"
              checked={policies.ipAllowlist}
              onChange={(v) => setPolicies((p) => ({ ...p, ipAllowlist: v }))}
            />
            <PolicyRow
              label="Auto sign-out after 30 min idle"
              hint="Applies to all shared workstations"
              checked={policies.autoLogout}
              onChange={(v) => setPolicies((p) => ({ ...p, autoLogout: v }))}
            />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="MFA gaps"
            description={withoutMfa.length === 0 ? "Everyone is covered" : `${withoutMfa.length} active ${withoutMfa.length === 1 ? "account" : "accounts"} without MFA`}
          />
          <PanelBody className="p-0">
            {withoutMfa.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-6 text-body-sm text-success">
                <ShieldCheck className="size-4" strokeWidth={2} />
                Full multi-factor coverage.
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {withoutMfa.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                    <PersonAvatar name={s.name} id={s.id} size="xs" initials={s.initials} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-medium text-ink">{s.name}</p>
                      <p className="text-caption text-ink-3">{s.role}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-caption text-danger">
                      <ShieldOff className="size-3.5" strokeWidth={2} />
                      Off
                    </span>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => toast(`Reminder sent to ${s.name}`)}>
                      Remind
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Sensitive activity" description="Reveals, exports, and sign-ins." />
          <PanelBody className="p-0">
            <ul className="divide-y divide-line">
              {sensitive.map((e) => (
                <li key={e.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-sm font-medium text-ink">{e.actorName}</span>
                    <time className="text-caption text-ink-3 tabular-nums">{relativeTime(e.timestamp)}</time>
                  </div>
                  <p className="text-caption text-ink-3">
                    {e.action} · {e.resource} {e.field ? `· ${e.field}` : ""}
                  </p>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-4 py-2.5">
              <a href="/admin/audit" className="inline-flex items-center gap-1.5 text-body-sm text-primary hover:underline">
                <KeyRound className="size-3.5" strokeWidth={2} />
                Open full audit log
              </a>
            </div>
          </PanelBody>
        </Panel>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-caption text-ink-3">
        <ShieldAlert className="size-3.5" strokeWidth={1.9} />
        Demonstration data. Policy toggles are not persisted.
      </p>
    </div>
  );
}

function PolicyRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-ink">{label}</p>
        <p className="text-caption text-ink-3">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
