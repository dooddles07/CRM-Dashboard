import {
  AtSign,
  CalendarDays,
  ClipboardList,
  FileText,
  Handshake,
  MessageSquare,
  MessageSquareWarning,
  PhoneCall,
  Star,
  Timer,
  Workflow,
} from "lucide-react";
import type { TimelineEvent, TimelineKind, Tone } from "@/lib/types";
import { groupTimeline } from "@/lib/timeline";
import { formatDate, formatTime, relativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";

const kindIcon: Record<TimelineKind, typeof CalendarDays> = {
  appointment: CalendarDays,
  message: MessageSquare,
  call: PhoneCall,
  email: AtSign,
  "follow-up": Timer,
  referral: Handshake,
  complaint: MessageSquareWarning,
  feedback: Star,
  note: FileText,
  task: ClipboardList,
  workflow: Workflow,
  record: FileText,
};

const toneRing: Record<Tone, string> = {
  success: "border-success-line bg-success-soft text-success",
  warning: "border-warning-line bg-warning-soft text-warning",
  danger: "border-danger-line bg-danger-soft text-danger",
  info: "border-info-line bg-info-soft text-info",
  ai: "border-ai-line bg-ai-soft text-ai",
  neutral: "border-line bg-surface-2 text-ink-3",
};

/**
 * The Spine. One chronological column with a continuous rule, so a record's
 * history reads in the order it happened instead of by hunting through tabs.
 */
export function Spine({ events }: { events: TimelineEvent[] }) {
  const groups = groupTimeline(events);

  return (
    <div className="px-4 py-3">
      {groups.map((group) => (
        <section key={group.key} className="relative">
          <h3 className="sticky top-14 z-10 -mx-4 flex items-baseline gap-2 bg-surface/95 px-4 py-1.5 text-label text-ink-3 backdrop-blur-sm">
            {formatDate(group.key)}
            <span className="font-normal normal-case tracking-normal text-ink-3/80">
              {relativeDay(group.key)}
            </span>
          </h3>

          {/* The rule runs through the glyph centres: left-3 matches a size-6
              marker anchored at left-0. */}
          <ol className="relative pb-1 pl-9">
            <span
              aria-hidden
              className="absolute bottom-3 left-3 top-3 w-px bg-line"
            />
            {group.events.map((e) => {
              const Icon = kindIcon[e.kind];
              return (
                <li key={e.id} className="relative py-2.5">
                  <span
                    className={cn(
                      // -left-9 cancels the list's pl-9 so the glyph centres on
                      // the rule at left-3 rather than sitting on the text.
                      "absolute -left-9 top-2.5 inline-flex size-6 items-center justify-center rounded-full border ring-4 ring-surface",
                      toneRing[e.tone],
                    )}
                  >
                    <Icon aria-hidden className="size-3" strokeWidth={2.25} />
                  </span>

                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-body-sm font-medium text-ink">{e.title}</p>
                    <time
                      dateTime={e.at}
                      className="shrink-0 text-caption text-ink-3 tabular-nums"
                    >
                      {formatTime(e.at)}
                    </time>
                  </div>
                  {e.detail && (
                    <p className="mt-0.5 text-body-sm leading-5 text-ink-3">{e.detail}</p>
                  )}
                  {e.actor && (
                    <p className="mt-1 text-caption text-ink-3">{e.actor}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
