"use client";

import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { feedbackStatus } from "@/lib/status";
import type { FeedbackDTO } from "@/lib/server/services/feedback";
import { formatNumber, relativeTime } from "@/lib/format";
import { PageHeader } from "@/components/data/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { EmptyState } from "@/components/data/states";
import { SatisfactionTrendChart } from "@/components/data/charts";
import { StatusChip } from "@/components/healthcare/status-chip";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const categories = ["Care quality", "Wait time", "Facilities", "Staff", "Billing"] as const;

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn("size-3.5", i < rating ? "fill-warning-solid text-warning-solid" : "text-line-strong")}
          strokeWidth={2}
        />
      ))}
    </span>
  );
}

interface FeedbackClientProps {
  feedback: FeedbackDTO[];
  summary: { average: number | null; total: number; distribution: Record<number, number> };
}

export function FeedbackClient({ feedback, summary }: FeedbackClientProps) {
  const [category, setCategory] = useState("all");
  const [rating, setRating] = useState("all");

  const filtered = useMemo(() => {
    return feedback
      .filter((f) => {
        if (category !== "all" && f.category !== category) return false;
        if (rating === "positive" && f.rating < 4) return false;
        if (rating === "neutral" && f.rating !== 3) return false;
        if (rating === "negative" && f.rating > 2) return false;
        return true;
      })
      .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  }, [feedback, category, rating]);

  // From the service summary, not from the rows below: filtering the list
  // must not move the headline figures.
  const positive = (summary.distribution[4] ?? 0) + (summary.distribution[5] ?? 0);

  // NPS is gone. It needs a 0–10 promoter/detractor scale and these are 1–5
  // satisfaction ratings — the seed simply carried a number with nothing
  // behind it. Computing one from the wrong scale would be inventing a metric.
  const kpis = [
    { label: "Average rating", value: summary.average === null ? "—" : `${summary.average} / 5` },
    { label: "Responses", value: formatNumber(summary.total) },
    {
      label: "Positive",
      value: summary.total === 0 ? "—" : `${Math.round((positive / summary.total) * 100)}%`,
    },
    { label: "Showing", value: formatNumber(feedback.length) },
  ];

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Feedback"
        description="What patients say after their visit — the signal behind the satisfaction score."
      />

      <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="lg:col-span-2">
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-lg border border-line bg-surface p-3 shadow-card">
                <p className="text-label text-ink-3">{k.label}</p>
                <p className="mt-1.5 text-[1.5rem] font-semibold leading-7 text-ink tabular-nums">{k.value}</p>
              </div>
            ))}
          </div>

          <Panel>
            <PanelHeader
              title="Responses"
              description={`${filtered.length} of ${feedback.length} shown`}
              actions={
                <div className="flex items-center gap-2">
                  <Select value={rating} onValueChange={setRating}>
                    <SelectTrigger size="sm" className="w-auto min-w-28" aria-label="Sentiment">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All ratings</SelectItem>
                      <SelectItem value="positive">Positive (4–5)</SelectItem>
                      <SelectItem value="neutral">Neutral (3)</SelectItem>
                      <SelectItem value="negative">Negative (1–2)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger size="sm" className="w-auto min-w-32" aria-label="Category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              }
            />
            <PanelBody className="p-0">
              {filtered.length === 0 ? (
                <EmptyState icon={Star} title="No feedback matches" description="Adjust the filters to see more responses." compact />
              ) : (
                <ul className="divide-y divide-line">
                  {filtered.map((f) => (
                    <FeedbackRow key={f.reference} item={f} />
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Six-month trend" description="Average score over time" />
            <PanelBody>
              <SatisfactionTrendChart />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Sentiment split" />
            <PanelBody className="space-y-2.5">
              {/* Bucketed from the real rating distribution — 4–5 positive,
                  3 neutral, 1–2 negative. The seed carried pre-computed
                  counts with no rows behind them. */}
              <SplitRow label="Positive" value={positive} total={summary.total} tone="bg-success-solid" />
              <SplitRow
                label="Neutral"
                value={summary.distribution[3] ?? 0}
                total={summary.total}
                tone="bg-warning-solid"
              />
              <SplitRow
                label="Negative"
                value={(summary.distribution[1] ?? 0) + (summary.distribution[2] ?? 0)}
                total={summary.total}
                tone="bg-danger-solid"
              />
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function FeedbackRow({ item }: { item: FeedbackDTO }) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <PersonAvatar name={item.patient.name} id={item.patient.reference} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-ink">{item.patient.name ?? "Anonymous"}</span>
            <Stars rating={item.rating} />
            <span className="rounded-sm border border-line bg-surface-2 px-1.5 py-px text-caption text-ink-2">
              {item.category}
            </span>
            <StatusChip meta={feedbackStatus[item.status]} />
          </div>
          <p className="mt-1 text-body-sm leading-5 text-ink-2">{item.comment}</p>
          <p className="mt-1 text-caption text-ink-3">
            {item.doctor?.name ?? "—"} · {(item.department?.name ?? "Unassigned")} ·{" "}
            <time dateTime={item.submittedAt}>{relativeTime(item.submittedAt)}</time>
          </p>
        </div>
      </div>
    </li>
  );
}

function SplitRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const pct = Math.round((value / total) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-body-sm">
        <span className="text-ink-2">{label}</span>
        <span className="text-ink-3 tabular-nums">{formatNumber(value)} · {pct}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-surface-3">
        <div className={cn("h-1.5 rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
