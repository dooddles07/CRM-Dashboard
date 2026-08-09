"use client";

import { useState } from "react";
import {
  BarChart3,
  CalendarClock,
  Download,
  FileText,
  HeartPulse,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/data/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { useCareflow } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/shared/create-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const catalogue = [
  { id: "patient-growth", name: "Patient growth", description: "New vs returning patients over time, by department.", icon: TrendingUp },
  { id: "appointments", name: "Appointment throughput", description: "Completed, cancelled, and no-show rates by day and clinic.", icon: CalendarClock },
  { id: "acquisition", name: "Lead acquisition", description: "Where leads come from and how well each source converts.", icon: Users },
  { id: "revenue", name: "Revenue by department", description: "Billed value and pipeline across clinical departments.", icon: Wallet },
  { id: "satisfaction", name: "Patient experience", description: "Satisfaction, NPS, and complaint resolution times.", icon: HeartPulse },
  { id: "doctor", name: "Clinician performance", description: "Load, satisfaction, and no-show rate per doctor.", icon: BarChart3 },
];

const ranges = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "quarter", label: "This quarter" },
  { id: "year", label: "This year" },
];

export default function ReportsPage() {
  const logAudit = useCareflow((s) => s.logAudit);
  const [report, setReport] = useState("patient-growth");
  const [range, setRange] = useState("30d");
  const [format, setFormat] = useState("pdf");

  function generate() {
    const name = catalogue.find((c) => c.id === report)?.name ?? report;
    logAudit({ action: "exported", resource: "Report", resourceId: report, field: `${range} · ${format}`, previousValue: null, newValue: null });
    toast("Report generated", { description: `${name} · ${ranges.find((r) => r.id === range)?.label} · ${format.toUpperCase()}. Recorded in the audit log.` });
  }

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Reports"
        description="Pull a standard report, or build one from the metrics that matter to you."
      />

      <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
          {catalogue.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setReport(c.id);
                toast(`${c.name} selected`, { description: "Set the range and format on the right, then generate." });
              }}
              className="group flex flex-col rounded-lg border border-line bg-surface p-4 text-left shadow-card transition-colors hover:border-line-strong hover:bg-surface-2"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-surface-2 text-ink-3 group-hover:text-primary">
                <c.icon className="size-4.5" strokeWidth={1.9} />
              </span>
              <p className="mt-3 font-medium text-ink group-hover:text-primary">{c.name}</p>
              <p className="mt-0.5 text-body-sm text-ink-3">{c.description}</p>
            </button>
          ))}
        </div>

        <Panel>
          <PanelHeader title="Build a report" description="Choose what to include, then generate." />
          <PanelBody className="space-y-3.5">
            <Field label="Report" htmlFor="rp-report">
              <Select value={report} onValueChange={setReport}>
                <SelectTrigger id="rp-report" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {catalogue.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Date range" htmlFor="rp-range">
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger id="rp-range" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ranges.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Format" htmlFor="rp-format">
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger id="rp-format" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="xlsx">Excel</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Button className="w-full" onClick={generate}>
              <Download className="size-3.5" strokeWidth={2} />
              Generate report
            </Button>
            <p className="flex items-center gap-1.5 text-caption text-ink-3">
              <FileText className="size-3.5" strokeWidth={1.9} />
              Exports are masked and recorded in the audit log.
            </p>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
