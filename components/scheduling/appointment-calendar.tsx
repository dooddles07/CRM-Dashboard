"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Tone } from "@/lib/types";
import type { AppointmentDTO } from "@/lib/server/services/appointments";
import { appointmentStatus } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const START_HOUR = 7;
const END_HOUR = 19;
const HOUR_PX = 56;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const toneBlock: Record<Tone, string> = {
  success: "border-success-line bg-success-soft text-success",
  warning: "border-warning-line bg-warning-soft text-warning",
  danger: "border-danger-line bg-danger-soft text-danger",
  info: "border-info-line bg-info-soft text-info",
  ai: "border-ai-line bg-ai-soft text-ai",
  neutral: "border-line bg-surface-2 text-ink-2",
};

/** ISO date (YYYY-MM-DD) for the Monday of the week containing `iso`. */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function monthLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function AppointmentCalendar({ appointments }: { appointments: AppointmentDTO[] }) {
  const router = useRouter();
  // `startsAt` is UTC (see appointments.ts's toDTO), so the day bucket below
  // reads it with the same UTC slice rather than the browser's local zone.
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, AppointmentDTO[]>();
    for (const d of days) map.set(d, []);
    for (const a of appointments) {
      const date = a.startsAt.slice(0, 10);
      if (map.has(date)) map.get(date)!.push(a);
    }
    return map;
  }, [days, appointments]);

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const weekAppts = days.reduce((sum, d) => sum + (byDay.get(d)?.length ?? 0), 0);

  return (
    <div className="rounded-lg border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous week"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
          >
            <ChevronLeft className="size-4" strokeWidth={2} />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next week"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
          >
            <ChevronRight className="size-4" strokeWidth={2} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(mondayOf(today))}>
            Today
          </Button>
          <p className="ml-1 text-h3 text-ink">
            {monthLabel(weekStart)} – {monthLabel(addDays(weekStart, 6))}
          </p>
        </div>
        <p className="text-body-sm text-ink-3 tabular-nums">{weekAppts} appointments this week</p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[56rem]">
          {/* Day header row */}
          <div className="grid border-b border-line" style={{ gridTemplateColumns: "3.5rem repeat(7, 1fr)" }}>
            <div className="border-r border-line" />
            {days.map((d) => {
              const isToday = d === today;
              const dow = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
              return (
                <div
                  key={d}
                  className={cn(
                    "border-r border-line px-2 py-2 text-center last:border-r-0",
                    isToday && "bg-primary-soft/50",
                  )}
                >
                  <p className="text-label text-ink-3">{DAY_LABELS[dow]}</p>
                  <p className={cn("text-body-sm font-medium tabular-nums", isToday ? "text-primary-soft-fg" : "text-ink")}>
                    {new Date(`${d}T00:00:00Z`).getUTCDate()}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="grid" style={{ gridTemplateColumns: "3.5rem repeat(7, 1fr)" }}>
            {/* Time gutter */}
            <div className="border-r border-line">
              {hours.map((h) => (
                <div key={h} className="relative border-b border-line/70" style={{ height: HOUR_PX }}>
                  <span className="absolute -top-2 right-1.5 text-caption text-ink-3 tabular-nums">
                    {String(h).padStart(2, "0")}:00
                  </span>
                </div>
              ))}
            </div>

            {days.map((d) => {
              const items = (byDay.get(d) ?? []).slice().sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
              return (
                <div
                  key={d}
                  className={cn(
                    "relative border-r border-line last:border-r-0",
                    d === today && "bg-primary-soft/20",
                  )}
                >
                  {hours.map((h) => (
                    <div key={h} className="border-b border-line/70" style={{ height: HOUR_PX }} />
                  ))}
                  {items.map((a) => {
                    const [hh, mm] = a.startsAt.slice(11, 16).split(":").map(Number);
                    const top = (hh - START_HOUR) * HOUR_PX + (mm / 60) * HOUR_PX;
                    const height = Math.max((a.durationMinutes / 60) * HOUR_PX - 2, 20);
                    if (hh < START_HOUR || hh >= END_HOUR) return null;
                    const meta = appointmentStatus[a.status];
                    return (
                      <button
                        key={a.reference}
                        type="button"
                        onClick={() => router.push(`/appointments/${a.reference}`)}
                        title={`${a.patient.name} · ${a.type} · ${meta.label}`}
                        className={cn(
                          "absolute inset-x-1 overflow-hidden rounded-[5px] border px-1.5 py-1 text-left transition-shadow hover:shadow-raised cursor-pointer",
                          toneBlock[meta.tone],
                        )}
                        style={{ top, height }}
                      >
                        <p className="truncate text-caption font-medium leading-4">{a.patient.name}</p>
                        {height > 30 && (
                          <p className="truncate text-[0.6875rem] leading-4 opacity-80">
                            {a.startsAt.slice(11, 16)} · {a.type}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-2.5">
        {(["confirmed", "completed", "in-consultation", "no-show", "cancelled"] as const).map((s) => {
          const meta = appointmentStatus[s];
          return (
            <span key={s} className="inline-flex items-center gap-1.5 text-caption text-ink-3">
              <span className={cn("size-2.5 rounded-[3px] border", toneBlock[meta.tone])} />
              {meta.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
