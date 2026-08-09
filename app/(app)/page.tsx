"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Download, Star } from "lucide-react";
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
import { AiInsightsPanel } from "@/components/dashboard/ai-insights";
import {
  AlertsPanel,
  TodaysAppointments,
  UpcomingTasks,
} from "@/components/dashboard/todays-operations";
import { Button } from "@/components/ui/button";
import { kpis, satisfaction } from "@/lib/data/analytics";
import { CURRENT_USER } from "@/lib/data/constants";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const scopes = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom" },
] as const;

export default function DashboardPage() {
  const [scope, setScope] = useState<(typeof scopes)[number]["id"]>("today");

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title={`Good morning, ${CURRENT_USER.name.split(" ")[0]}`}
        description="Here's what's happening across your hospital today."
        actions={
          <>
            <div
              role="group"
              aria-label="Date range"
              className="flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5"
            >
              {scopes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={scope === s.id}
                  onClick={() => setScope(s.id)}
                  className={cn(
                    "rounded-[4px] px-2.5 py-1 text-body-sm transition-colors duration-150 cursor-pointer",
                    scope === s.id
                      ? "bg-primary-soft font-medium text-primary-soft-fg"
                      : "text-ink-3 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm">
              <Download className="size-3.5" strokeWidth={2} />
              Export
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        {/* KPI strip */}
        <section aria-label="Key metrics">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {kpis.map((kpi) => (
              <KpiCard key={kpi.id} kpi={kpi} />
            ))}
          </div>
        </section>

        {/* Two independent columns so neither waits on the other's height */}
        <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          <div className="space-y-4 lg:col-span-2">
            <Panel>
              <PanelHeader
                title="Patient growth"
                description="New and returning patients, last 12 months"
                actions={
                  <Link
                    href="/analytics"
                    className="text-body-sm text-primary underline-offset-2 hover:underline"
                  >
                    Full analytics
                  </Link>
                }
              />
              <PanelBody>
                <PatientGrowthChart />
              </PanelBody>
            </Panel>
            <TodaysAppointments />
          </div>

          <div className="space-y-4">
            <AiInsightsPanel />
            <AlertsPanel />
            <UpcomingTasks />
          </div>
        </div>

        {/* Operational mix */}
        <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          <Panel>
            <PanelHeader
              title="Appointment overview"
              description="Last 7 days by outcome"
            />
            <PanelBody>
              <AppointmentOverviewChart />
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Patients by department"
              description="18,241 active records"
            />
            <PanelBody>
              <DepartmentDonut />
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Lead conversion"
              description="This month, new inquiry to converted"
              actions={
                <Link
                  href="/leads"
                  className="text-body-sm text-primary underline-offset-2 hover:underline"
                >
                  Pipeline
                </Link>
              }
            />
            <PanelBody>
              <LeadFunnel />
            </PanelBody>
          </Panel>
        </div>

        {/* Acquisition and experience */}
        <div className="grid items-start gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <Panel>
            <PanelHeader
              title="Patient acquisition sources"
              description="Leads and conversions this month"
            />
            <PanelBody>
              <AcquisitionSourcesChart />
            </PanelBody>
          </Panel>

          <Panel className="flex flex-col">
            <PanelHeader
              title="Patient satisfaction"
              description={`${formatNumber(satisfaction.responses)} responses · ${satisfaction.responseRate}% response rate`}
              actions={
                <Link
                  href="/feedback"
                  className="text-body-sm text-primary underline-offset-2 hover:underline"
                >
                  All feedback
                </Link>
              }
            />
            <PanelBody className="flex-1">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-label text-ink-3">Overall</p>
                  <p className="mt-1 flex items-baseline gap-1">
                    <span className="text-[1.5rem] font-semibold leading-7 text-ink tabular-nums">
                      {satisfaction.score}
                    </span>
                    <span className="text-body-sm text-ink-3">/ 5</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-0.5" aria-hidden>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "size-3",
                          i < Math.round(satisfaction.score)
                            ? "fill-warning-solid text-warning-solid"
                            : "text-line-strong",
                        )}
                        strokeWidth={2}
                      />
                    ))}
                  </p>
                </div>
                <div>
                  <p className="text-label text-ink-3">NPS</p>
                  <p className="mt-1 text-[1.5rem] font-semibold leading-7 text-ink tabular-nums">
                    +{satisfaction.nps}
                  </p>
                  <p className="mt-0.5 text-caption text-success tabular-nums">
                    +{satisfaction.npsChange} this quarter
                  </p>
                </div>
                <div>
                  <p className="text-label text-ink-3">Positive</p>
                  <p className="mt-1 text-[1.5rem] font-semibold leading-7 text-ink tabular-nums">
                    {formatNumber(satisfaction.positive)}
                  </p>
                  <p className="mt-0.5 text-caption text-ink-3">
                    {Math.round((satisfaction.positive / satisfaction.responses) * 100)}% of responses
                  </p>
                </div>
                <div>
                  <p className="text-label text-ink-3">Open complaints</p>
                  <p className="mt-1 text-[1.5rem] font-semibold leading-7 text-danger tabular-nums">
                    {satisfaction.openComplaints}
                  </p>
                  <p className="mt-0.5 text-caption text-ink-3">1 past its SLA</p>
                </div>
              </div>
              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-1 text-caption text-ink-3">Six-month trend</p>
                <SatisfactionTrendChart />
              </div>
            </PanelBody>
          </Panel>
        </div>

        <p className="flex items-center gap-1.5 pt-1 text-caption text-ink-3">
          <CalendarDays aria-hidden className="size-3.5" strokeWidth={1.9} />
          Showing {scopes.find((s) => s.id === scope)?.label.toLowerCase()} ·
          demonstration data, no real patient records
        </p>
      </div>
    </div>
  );
}
