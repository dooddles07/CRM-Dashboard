"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Send, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { aiInsights } from "@/lib/data/analytics";
import { PageHeader } from "@/components/data/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const suggestions = [
  "Which department has the worst no-show rate, and why?",
  "Where are we losing the most leads in the funnel?",
  "Summarise this week's patient complaints.",
  "Which doctors are over capacity?",
];

interface Turn {
  q: string;
  a: string;
}

const answerFor = (q: string) =>
  `Based on the current demonstration data: ${q.replace(/\?$/, "")} — Pediatrics carries the highest no-show rate at 11.8%, well above the 8% threshold, and its reminders send only 24 hours ahead. Departments that send at 48 and 4 hours sit below 7%. Recommended next step: align Pediatrics with the two-stage reminder cascade and review the 27 outstanding follow-ups, five of which are already overdue.`;

export default function AiPage() {
  const [prompt, setPrompt] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);

  function ask(q: string) {
    const question = q.trim();
    if (!question) return;
    setTurns((t) => [...t, { q: question, a: answerFor(question) }]);
    setPrompt("");
  }

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="CareFlow AI"
        description="Ask questions of your hospital's data in plain language, and act on what it surfaces."
      />

      <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Panel className="flex flex-col lg:col-span-2">
          <PanelHeader
            title={
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-md bg-ai-soft text-ai">
                  <Sparkles className="size-3.5" strokeWidth={2} />
                </span>
                Assistant
              </span>
            }
            description="Answers use demonstration data only."
          />
          <PanelBody className="flex-1 space-y-4">
            {turns.length === 0 ? (
              <div className="rounded-lg border border-ai-line bg-ai-soft/50 p-4">
                <p className="text-body-sm text-ink-2">
                  Try a question below, or ask your own. The assistant can read across patients,
                  appointments, leads, and complaints.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="rounded-full border border-ai-line bg-surface px-3 py-1 text-caption text-ai transition-colors hover:bg-ai-soft cursor-pointer"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="space-y-4">
                {turns.map((t, i) => (
                  <li key={i} className="space-y-2">
                    <div className="flex justify-end">
                      <p className="max-w-[80%] rounded-lg border border-primary-line bg-primary-soft px-3 py-2 text-body-sm text-primary-soft-fg">
                        {t.q}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-ai-soft text-ai">
                        <Sparkles className="size-3.5" strokeWidth={2} />
                      </span>
                      <p className="max-w-[80%] rounded-lg border border-ai-line bg-ai-soft/60 px-3 py-2 text-body-sm leading-6 text-ink-2">
                        {t.a}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
          <div className="border-t border-line p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={1}
                placeholder="Ask about patients, appointments, leads, or complaints…"
                className="min-h-9 resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(prompt);
                  }
                }}
              />
              <Button size="icon" aria-label="Send" onClick={() => ask(prompt)} disabled={!prompt.trim()}>
                <Send className="size-4" strokeWidth={2} />
              </Button>
            </div>
            <p className="mt-1.5 text-caption text-ink-3">
              CareFlow AI can make mistakes. Verify anything that affects patient care.
            </p>
          </div>
        </Panel>

        <div className="space-y-3">
          <p className="px-0.5 text-label text-ink-3">Proactive insights</p>
          {aiInsights.map((insight) => {
            const Trend = insight.direction === "up" ? TrendingUp : insight.direction === "down" ? TrendingDown : ArrowRight;
            return (
              <div key={insight.id} className="rounded-lg border border-ai-line bg-surface p-3 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-body-sm font-medium text-ink">{insight.headline}</p>
                  <span className={cn("inline-flex shrink-0 items-center gap-0.5 text-body-sm font-medium tabular-nums", "text-ai")}>
                    <Trend className="size-3.5" strokeWidth={2.5} />
                    {insight.metric}
                  </span>
                </div>
                <p className="mt-1 text-caption leading-5 text-ink-3">{insight.explanation}</p>
                <Link
                  href={insight.action.href}
                  className="mt-2 inline-flex items-center gap-1 text-body-sm text-ai underline-offset-2 hover:underline"
                >
                  {insight.action.label}
                  <ArrowRight className="size-3.5" strokeWidth={2} />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
