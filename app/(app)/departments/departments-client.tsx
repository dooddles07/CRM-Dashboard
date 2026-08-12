"use client";

import Link from "next/link";
import { Building2, TrendingUp, Users } from "lucide-react";
import type { DepartmentDTO } from "@/lib/server/services/directory";
import { noShowRisk } from "@/lib/status";
import { formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/data/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { DepartmentDonut } from "@/components/data/charts";
import { StatusChip } from "@/components/healthcare/status-chip";
import { cn } from "@/lib/utils";

export function DepartmentsClient({ departments }: { departments: DepartmentDTO[] }) {
  const totals = departments.reduce(
    (acc, d) => ({
      patients: acc.patients + d.patientCount,
      appointments: acc.appointments + d.upcomingAppointments,
      doctors: acc.doctors + d.doctorCount,
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
                  <p className="mt-0.5 text-caption text-ink-3">Head · {(d.head?.name ?? "Unassigned")}</p>
                  <p className="text-caption text-ink-3">{d.floor}</p>
                </div>
                {/*
                  The growth percentage is gone. The seed carried an invented
                  figure and nothing in the schema records a prior period to
                  compare against, so there is no honest way to compute one. A
                  fabricated trend on an operations dashboard is worse than an
                  absent one — it is the number somebody would act on.

                  Open follow-up work is shown instead: real, current, and
                  what a department head would actually chase.
                */}
                <span className="inline-flex items-center gap-1 text-body-sm font-medium tabular-nums text-ink-2">
                  <TrendingUp className="size-3.5 text-ink-3" strokeWidth={2.5} />
                  {d.upcomingAppointments} upcoming
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
                <Stat label="Patients" value={formatNumber(d.patientCount)} />
                <Stat label="Doctors" value={`${d.doctorCount}`} />
                <Stat label="Rating" value={d.satisfaction === null ? "—" : `${d.satisfaction}`} />
              </dl>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-caption text-ink-3">No-show rate</span>
                <StatusChip
                  meta={{
                    label: d.noShowRate === null ? "—" : `${d.noShowRate}%`,
                    tone: noShowRisk(d.noShowRate ?? 0),
                    icon: Building2,
                  }}
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
                {["Department", "Patients", "Appointments", "Doctors", "Leads", "No-show", "Satisfaction"].map((h, i) => (
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
                  <td className="px-3 py-2.5 text-right text-body-sm text-ink-2 tabular-nums">{formatNumber(d.patientCount)}</td>
                  <td className="px-3 py-2.5 text-right text-body-sm text-ink-2 tabular-nums">{formatNumber(d.upcomingAppointments)}</td>
                  <td className="px-3 py-2.5 text-right text-body-sm text-ink-2 tabular-nums">{d.doctorCount}</td>
                  <td className="px-3 py-2.5 text-right text-body-sm text-ink-2 tabular-nums">{d.leadCount}</td>
                  <td className="px-3 py-2.5 text-right text-body-sm tabular-nums">
                    <span className={noShowRisk(d.noShowRate ?? 0) === "danger" ? "text-danger" : noShowRisk(d.noShowRate ?? 0) === "warning" ? "text-warning" : "text-success"}>
                      {d.noShowRate === null ? "—" : `${d.noShowRate}%`}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-body-sm text-ink-2 tabular-nums">{d.satisfaction ?? "—"}</td>
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
