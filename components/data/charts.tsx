"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  acquisitionSources,
  appointmentOverview,
  departmentDistribution,
  leadFunnel,
  patientGrowth,
  satisfaction,
} from "@/lib/data/analytics";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const axis = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const;

/* -------------------------------------------------------------------------- */

const growthConfig = {
  newPatients: { label: "New", color: "var(--chart-1)" },
  returning: { label: "Returning", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function PatientGrowthChart({ className }: { className?: string }) {
  return (
    <ChartContainer config={growthConfig} className={cn("aspect-auto h-56 w-full", className)}>
      <LineChart data={patientGrowth} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="month" {...axis} />
        <YAxis {...axis} width={40} tickFormatter={(v) => `${v / 1000}k`} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          dataKey="newPatients"
          type="monotone"
          stroke="var(--color-newPatients)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          dataKey="returning"
          type="monotone"
          stroke="var(--color-returning)"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ChartContainer>
  );
}

/* -------------------------------------------------------------------------- */

const appointmentConfig = {
  completed: { label: "Completed", color: "var(--chart-5)" },
  scheduled: { label: "Scheduled", color: "var(--chart-1)" },
  cancelled: { label: "Cancelled", color: "var(--chart-6)" },
  noShow: { label: "No-show", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function AppointmentOverviewChart({ className }: { className?: string }) {
  return (
    <ChartContainer
      config={appointmentConfig}
      className={cn("aspect-auto h-56 w-full", className)}
    >
      <BarChart data={appointmentOverview} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="day" {...axis} />
        <YAxis {...axis} width={36} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="completed" stackId="a" fill="var(--color-completed)" radius={[0, 0, 2, 2]} />
        <Bar dataKey="scheduled" stackId="a" fill="var(--color-scheduled)" />
        <Bar dataKey="cancelled" stackId="a" fill="var(--color-cancelled)" />
        <Bar dataKey="noShow" stackId="a" fill="var(--color-noShow)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

/* -------------------------------------------------------------------------- */

const departmentConfig = Object.fromEntries(
  departmentDistribution.map((d, i) => [
    d.department,
    { label: d.department, color: `var(--chart-${i + 1})` },
  ]),
) satisfies ChartConfig;

export function DepartmentDonut({ className }: { className?: string }) {
  const total = departmentDistribution.reduce((s, d) => s + d.patients, 0);

  // The legend sits below rather than beside: this panel is a third of the
  // grid, and department names truncate to nothing in a side column.
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <ChartContainer
        config={departmentConfig}
        className="aspect-square h-36 w-36 shrink-0"
      >
        <PieChart>
          <ChartTooltip
            content={<ChartTooltipContent nameKey="department" hideLabel />}
          />
          <Pie
            data={departmentDistribution}
            dataKey="patients"
            nameKey="department"
            innerRadius="58%"
            outerRadius="100%"
            paddingAngle={1.5}
            strokeWidth={0}
          >
            {departmentDistribution.map((d) => (
              <Cell key={d.department} fill={d.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>

      <ul className="w-full space-y-1.5 border-t border-line pt-3">
        {departmentDistribution.map((d) => (
          <li key={d.department} className="flex items-center gap-2 text-body-sm">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: d.fill }}
            />
            <span className="min-w-0 flex-1 truncate text-ink-2">{d.department}</span>
            <span className="shrink-0 font-medium text-ink tabular-nums">
              {formatNumber(d.patients)}
            </span>
            <span className="w-9 shrink-0 text-right text-caption text-ink-3 tabular-nums">
              {((d.patients / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Proportional bars rather than a tapered funnel shape: the drop between two
 * stages is the number staff act on, and a taper hides it.
 */
export function LeadFunnel({ className }: { className?: string }) {
  const top = leadFunnel[0].count;

  return (
    <ol className={cn("space-y-2", className)}>
      {leadFunnel.map((stage, i) => {
        const previous = i === 0 ? null : leadFunnel[i - 1].count;
        const drop = previous ? previous - stage.count : 0;
        const dropPct = previous ? (drop / previous) * 100 : 0;
        const width = (stage.count / top) * 100;

        return (
          <li key={stage.stage}>
            <div className="flex items-baseline justify-between gap-3 text-body-sm">
              <span className="truncate text-ink-2">{stage.stage}</span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="font-medium text-ink tabular-nums">
                  {formatNumber(stage.count)}
                </span>
                {previous && (
                  <span className="w-14 text-right text-caption text-danger tabular-nums">
                    −{dropPct.toFixed(0)}%
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-surface-3">
              <div
                className="h-2 rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${width}%`, opacity: 1 - i * 0.11 }}
              />
            </div>
          </li>
        );
      })}
      <li className="flex items-baseline justify-between border-t border-line pt-2 text-body-sm">
        <span className="text-ink-3">End-to-end conversion</span>
        <span className="font-medium text-success tabular-nums">
          {((leadFunnel[leadFunnel.length - 1].count / top) * 100).toFixed(1)}%
        </span>
      </li>
    </ol>
  );
}

/* -------------------------------------------------------------------------- */

const sourceConfig = {
  leads: { label: "Leads", color: "var(--chart-1)" },
  converted: { label: "Converted", color: "var(--chart-5)" },
} satisfies ChartConfig;

export function AcquisitionSourcesChart({ className }: { className?: string }) {
  return (
    <ChartContainer
      config={sourceConfig}
      className={cn("aspect-auto h-60 w-full", className)}
    >
      <BarChart
        data={acquisitionSources}
        layout="vertical"
        margin={{ left: 4, right: 12, top: 4, bottom: 0 }}
        barGap={2}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" {...axis} />
        {/* interval 0 keeps every source labelled; recharts drops ticks otherwise */}
        <YAxis type="category" dataKey="source" {...axis} width={68} interval={0} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="leads" fill="var(--color-leads)" radius={[0, 3, 3, 0]} barSize={9} />
        <Bar dataKey="converted" fill="var(--color-converted)" radius={[0, 3, 3, 0]} barSize={9} />
      </BarChart>
    </ChartContainer>
  );
}

/* -------------------------------------------------------------------------- */

const satisfactionConfig = {
  score: { label: "Satisfaction", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function SatisfactionTrendChart({ className }: { className?: string }) {
  return (
    <ChartContainer
      config={satisfactionConfig}
      className={cn("aspect-auto h-28 w-full", className)}
    >
      <AreaChart data={satisfaction.trend} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="satisfaction-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-score)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--color-score)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="month" {...axis} />
        <YAxis hide domain={[4.2, 4.7]} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <Area
          dataKey="score"
          type="monotone"
          stroke="var(--color-score)"
          strokeWidth={2}
          fill="url(#satisfaction-fill)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
