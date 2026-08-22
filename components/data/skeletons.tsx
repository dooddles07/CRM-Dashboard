import { cn } from "@/lib/utils";
import { Panel } from "./panel";

/** Skeletons mirror the shape of the content they stand in for, not a spinner. */
export function Bar({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <span style={style} className={cn("skeleton block h-3", className)} />;
}

/** Fill fractions per cell so the skeleton never widens its own container. */
const cellFill = [88, 62, 74, 55, 68, 58, 71, 60];

export function TableSkeleton({
  rows = 8,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  const template = `1.5fr ${"1fr ".repeat(Math.max(columns - 1, 0))}`.trim();

  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading records</span>
      <div
        className="grid gap-3 border-b border-line bg-surface-2 px-4 py-2.5"
        style={{ gridTemplateColumns: template }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <Bar key={i} className="w-full" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid items-center gap-3 border-b border-line px-4 py-3 last:border-0"
          style={{ gridTemplateColumns: template }}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Bar key={c} style={{ width: `${cellFill[(r + c) % cellFill.length]}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      aria-busy="true"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Panel key={i} className="p-3">
          <Bar className="w-20" />
          <Bar className="mt-3 h-6 w-16" />
          <Bar className="mt-3 w-24" />
        </Panel>
      ))}
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-busy="true"
      className={cn("flex h-full items-end gap-2 px-1 pb-1", className)}
    >
      <span className="sr-only">Loading chart</span>
      {[52, 71, 44, 88, 63, 79, 48, 92, 58, 74, 66, 83].map((h, i) => (
        <span
          key={i}
          className="skeleton flex-1 rounded-t-sm"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

/** Mirrors RecordHeader + a two-column body — the shape every entity detail screen shares. */
export function RecordSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="mx-auto max-w-[100rem]">
      <span className="sr-only">Loading record</span>
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex items-start gap-3">
          <span className="skeleton size-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Bar className="w-48" />
            <Bar className="w-32" />
          </div>
        </div>
        <div className="mt-4 grid gap-4 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Bar className="w-16" />
              <Bar className="w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel className="p-4">
            <Bar className="w-32" />
            <Bar className="mt-3 w-full" />
            <Bar className="mt-2 w-2/3" />
          </Panel>
          <Panel className="p-4">
            <Bar className="w-32" />
            <Bar className="mt-3 w-full" />
            <Bar className="mt-2 w-1/2" />
          </Panel>
        </div>
        <Panel className="p-4">
          <Bar className="w-24" />
          <Bar className="mt-3 w-full" />
          <Bar className="mt-2 w-3/4" />
        </Panel>
      </div>
    </div>
  );
}

export function CardListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div aria-busy="true" className="divide-y divide-line">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3">
          <span className="skeleton size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Bar className="w-40" />
            <Bar className="w-56" />
          </div>
          <Bar className="w-14" />
        </div>
      ))}
    </div>
  );
}
