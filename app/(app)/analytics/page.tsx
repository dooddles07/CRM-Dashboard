"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/data/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { KpiCard } from "@/components/data/kpi-card";
import {
  AcquisitionSourcesChart,
  AppointmentOverviewChart,
  DepartmentDonut,
  LeadFunnel,
  PatientGrowthChart,
  SatisfactionTrendChart,
} from "@/components/data/charts";
import { kpis } from "@/lib/data/analytics";
import { departments } from "@/lib/data/constants";
import { noShowRisk } from "@/lib/status";
import { formatNumber } from "@/lib/format";
import { useCareflow } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const scopes = [
  { id: "month", label: "This month" },
  { id: "quarter", label: "This quarter" },
  { id: "year", label: "This year" },
] as const;

export default function AnalyticsPage() {
  const logAudit = useCareflow((s) => s.logAudit);
  const [scope, setScope] = useState<(typeof scopes)[number]["id"]>("month");

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Analytics"
        description="The whole picture: growth, throughput, acquisition, and experience across the hospital."
        actions={
          <>
            <div role="group" aria-label="Date range" className="flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5">
              {scopes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={scope === s.id}
                  onClick={() => setScope(s.id)}
                  className={cn(
                    "rounded-[4px] px-2.5 py-1 text-body-sm transition-colors cursor-pointer",
                    scope === s.id ? "bg-primary-soft font-medium text-primary-soft-fg" : "text-ink-3 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                logAudit({ action: "exported", resource: "Analytics", resourceId: `scope:${scope}`, field: "report", previousValue: null, newValue: null });
                toast("Report exported", { description: "Recorded in the audit log." });
              }}
            >
              <Download className="size-3.5" strokeWidth={2} />
              Export
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map((k) => (
            <KpiCard key={k.id} kpi={k} />
          ))}
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          <Panel className="lg:col-span-2">
            <PanelHeader title="Patient growth" description="New and returning patients, last 12 months" />
            <PanelBody>
              <PatientGrowthChart />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Patients by department" description={`${formatNumber(18241)} active records`} />
            <PanelBody>
              <DepartmentDonut />
            </PanelBody>
          </Panel>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          <Panel>
            <PanelHeader title="Appointment overview" description="Last 7 days by outcome" />
            <PanelBody>
              <AppointmentOverviewChart />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Lead conversion" description="New inquiry to converted" />
            <PanelBody>
              <LeadFunnel />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Acquisition sources" description="Leads and conversions this month" />
            <PanelBody>
              <AcquisitionSourcesChart />
            </PanelBody>
          </Panel>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          <Panel className="lg:col-span-2">
            <PanelHeader title="Department performance" description="Load, satisfaction, and growth side by side" />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: "40rem" }}>
                <thead>
                  <tr className="border-b border-line bg-surface-2">
                    {["Department", "Patients", "No-show", "Satisfaction", "Growth"].map((h, i) => (
                      <th key={h} className={cn("px-3 py-2 text-label text-ink-3", i === 0 ? "text-left" : "text-right")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {departments.map((d) => (
                    <tr key={d.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2.5 text-body-sm font-medium text-ink">{d.name}</td>
                      <td className="px-3 py-2.5 text-right text-body-sm text-ink-2 tabular-nums">{formatNumber(d.patients)}</td>
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
          <Panel>
            <PanelHeader title="Satisfaction trend" description="Average score, six months" />
            <PanelBody>
              <SatisfactionTrendChart />
            </PanelBody>
          </Panel>
        </div>

        <p className="pt-1 text-caption text-ink-3">
          Showing {scopes.find((s) => s.id === scope)?.label.toLowerCase()} · demonstration data, no real patient records.
        </p>
      </div>
    </div>
  );
}
