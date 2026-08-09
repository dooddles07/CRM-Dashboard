import Link from "next/link";
import { ArrowRight, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { aiInsights } from "@/lib/data/analytics";
import { Panel } from "@/components/data/panel";

/**
 * Each insight states the finding, the number behind it, why it matters, and
 * the one action a person can take. An observation with no next step is noise.
 */
export function AiInsightsPanel() {
  return (
    <Panel className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-6 items-center justify-center rounded-md border border-ai-line bg-ai-soft text-ai">
            <Sparkles aria-hidden className="size-3.5" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-h3 text-ink">AI insights</h2>
            <p className="text-caption text-ink-3">Updated 09:15 today</p>
          </div>
        </div>
        <Link
          href="/ai"
          className="shrink-0 text-body-sm text-primary underline-offset-2 hover:underline"
        >
          Ask CareFlow AI
        </Link>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-line">
        {aiInsights.map((insight) => {
          const Trend = insight.direction === "down" ? TrendingDown : TrendingUp;
          return (
            <li key={insight.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-body-sm font-medium leading-5 text-ink">
                  {insight.headline}
                </p>
                <span className="flex shrink-0 items-center gap-1 rounded-sm border border-ai-line bg-ai-soft px-1.5 py-0.5 text-caption font-semibold text-ai tabular-nums">
                  <Trend aria-hidden className="size-3" strokeWidth={2.5} />
                  {insight.metric}
                </span>
              </div>
              <p className="mt-1 text-body-sm leading-5 text-ink-3">
                {insight.explanation}
              </p>
              <Link
                href={insight.action.href}
                className="mt-1.5 inline-flex items-center gap-1 text-body-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                {insight.action.label}
                <ArrowRight aria-hidden className="size-3.5" strokeWidth={2.25} />
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-line px-4 py-2.5 text-caption leading-4 text-ink-3">
        AI-generated information should be reviewed by authorised staff before
        action. CareFlow AI does not diagnose patients or make treatment
        decisions.
      </p>
    </Panel>
  );
}
