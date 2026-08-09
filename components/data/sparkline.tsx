import type { Tone } from "@/lib/types";
import { cn } from "@/lib/utils";

const stroke: Record<Tone, string> = {
  success: "var(--success)",
  warning: "var(--warning-solid)",
  danger: "var(--danger)",
  info: "var(--primary)",
  ai: "var(--ai)",
  neutral: "var(--neutral-solid)",
};

interface SparklineProps {
  values: number[];
  tone?: Tone;
  className?: string;
  /** Decorative next to a value that already states the number. */
  label?: string;
}

/**
 * A trend trace for a figure that is already written out beside it. Small
 * enough to sit inside a KPI card without pretending to be a chart.
 */
export function Sparkline({
  values,
  tone = "info",
  className,
  label,
}: SparklineProps) {
  if (values.length < 2) return null;

  const w = 100;
  const h = 28;
  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const last = points[points.length - 1];
  const id = `spark-${tone}-${values.length}-${Math.round(values[0])}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-7 w-full", className)}
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke[tone]} stopOpacity="0.16" />
          <stop offset="100%" stopColor={stroke[tone]} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke[tone]}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last[0]} cy={last[1]} r="2" fill={stroke[tone]} />
    </svg>
  );
}
