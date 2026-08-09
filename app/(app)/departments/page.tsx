"use client";

import Link from "next/link";
import { Building2, TrendingDown, TrendingUp, Users } from "lucide-react";
import { departments } from "@/lib/data/constants";
import { noShowRisk } from "@/lib/status";
import { formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/data/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { DepartmentDonut } from "@/components/data/charts";
import { StatusChip } from "@/components/healthcare/status-chip";
import { cn } from "@/lib/utils";

export default function DepartmentsPage() {
  const totals = departments.reduce(
    (acc, d) => ({
      patients: acc.patients + d.patients,
      appointments: acc.appointments + d.appointments,
      doctors: acc.doctors + d.doctors,
    }),
    { patients: 0, appointments: 0, doctors: 0 },
  );

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Departments"
        description="How each clinical department is loaded, staffed, and rated."
      />

      <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
          {departments.map((d) => (
            <div key={d.id} className="flex flex-col rounded-lg border border-line bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{d.name}</p>
                  <p className="mt-0.5 text-caption text-ink-3">Head · {d.head}</p>
                  <p className="text-caption text-ink-3">{d.floor}</p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 text-body-sm font-medium tabular-nums",
                    d.growth >= 0 ? "text-success" : "text-danger",
                  )}
                >
                  {d.growth >= 0 ? (
                    <TrendingUp className="size-3.5" strokeWidth={2.5} />
                  ) : (
                    <TrendingDown className="size-3.5" strokeWidth={2.5} />
                  )}
                  {d.growth > 0 ? "+" : ""}
                  {d.growth}%
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
                <Stat label="Patients" value={formatNumber(d.patients)} />
                <Stat label="Doctors" value={`${d.doctors}`} />
                <Stat label="Rating" value={`${d.satisfaction}`} />
              </dl>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-caption text-ink-3">No-show rate</span>
                <StatusChip
                  meta={{ label: `${d.noShowRate}%`, tone: noShowRisk(d.noShowRate), icon: Building2 }}
                  showIcon={false}
                />
              </div>

              <Link
                href={`/patients?department=${d.id}`}
                className="mt-3 inline-flex items-center gap-1 text-body-sm text-primary underline-offset-2 hover:underline"
              >
                <Users className="size-3.5" strokeWidth={2} />
                View patients
              </Link>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Patient distribution" description={`${formatNumber(totals.patients)} active records`} />
            <PanelBody>
              <DepartmentDonut />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Hospital totals" />
            <PanelBody className="space-y-3">
              <Row label="Total patients" value={formatNumber(totals.patients)} />
              <Row label="Monthly appointments" value={formatNumber(totals.appointments)} />
              <Row label="Doctors" value={`${totals.doctors}`} />
              <Row label="Departments" value={`${departments.length}`} />
            </PanelBody>
          </Panel>
        </div>
      </div>

      <Panel className="mt-4">
        <PanelHeader title="Comparison" description="Every department, side by side." />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: "56rem" }}>
            <thead>
              <tr className="border-b border-line bg-surface-2">
                {["Department", "Patients", "Appointments", "Doctors", "Leads", "No-show", "Satisfaction", "Growth"].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={cn("whitespace-nowrap px-3 py-2 text-label text-ink-3", i === 0 ? "text-left" : "text-right")}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-3 py-2.5 text-body-sm font-medium text-ink">{d.name}</td>
                  <td className="px-3 py-2.5 text-right text-body-sm text-ink-2 tabular-nums">{formatNumber(d.patients)}</td>
                  <td className="px-3 py-2.5 text-right text-body-sm text-ink-2 tabular-nums">{formatNumber(d.appointments)}</td>
                  <td className="px-3 py-2.5 text-right text-body-sm text-ink-2 tabular-nums">{d.doctors}</td>
                  <td className="px-3 py-2.5 text-right text-body-sm text-ink-2 tabular-nums">{d.leads}</td>
                  <td className="px-3 py-2.5 text-right text-body-sm tabular-nums">
                    <span className={noShowRisk(d.noShowRate) === "danger" ? "text-danger" : noShowRisk(d.noShowRate) === "warning" ? "text-warning" : "text-success"}>
                      {d.noShowRate}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-body-sm text-ink-2 tabular-nums">{d.satisfaction}</td>
                  <td className="px-3 py-2.5 text-right text-body-sm tabular-nums">
                    <span className={d.growth >= 0 ? "text-success" : "text-danger"}>
                      {d.growth > 0 ? "+" : ""}
                      {d.growth}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 text-center">
      <dt className="text-label text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-body-sm font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-body-sm">
      <span className="text-ink-3">{label}</span>
      <span className="font-medium text-ink tabular-nums">{value}</span>
    </div>
  );
}
