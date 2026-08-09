import Link from "next/link";
import { ArrowRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { KpiDatum } from "@/lib/types";
import { trendTone } from "@/lib/status";
import { formatSignedPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";

const toneText = {
  success: "text-success",
  danger: "text-danger",
  neutral: "text-ink-3",
} as const;

export function KpiCard({ kpi }: { kpi: KpiDatum }) {
  const tone = trendTone(kpi.change, kpi.invertTrend);
  const Trend =
    kpi.change === 0 ? Minus : kpi.change > 0 ? TrendingUp : TrendingDown;

  return (
    <Link
      href={kpi.href}
      className={cn(
        "group flex flex-col rounded-lg border border-line bg-surface p-3 shadow-card",
        "transition-colors duration-150 hover:border-line-strong hover:bg-surface-2",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-label text-ink-3">{kpi.label}</span>
        <ArrowRight
          aria-hidden
          strokeWidth={2}
          className="size-3.5 shrink-0 text-ink-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        />
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[1.5rem] font-semibold leading-8 tracking-[-0.02em] text-ink tabular-nums">
          {kpi.value}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-body-sm font-medium tabular-nums",
            toneText[tone === "warning" || tone === "info" || tone === "ai" ? "neutral" : tone],
          )}
        >
          <Trend aria-hidden strokeWidth={2.5} className="size-3.5" />
          {formatSignedPercent(kpi.change)}
        </span>
      </div>

      <p className="mt-0.5 text-caption text-ink-3">{kpi.comparison}</p>

      <div className="mt-2.5">
        <Sparkline values={kpi.series} tone={kpi.tone} />
      </div>

      <p className="mt-2 border-t border-line pt-2 text-caption leading-4 text-ink-2">
        {kpi.context}
      </p>
    </Link>
  );
}
