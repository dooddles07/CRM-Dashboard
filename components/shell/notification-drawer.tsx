"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BellRing,
  CalendarDays,
  ClipboardList,
  MessageSquareWarning,
  ServerCrash,
  ShieldCheck,
  Timer,
  Waypoints,
} from "lucide-react";
import type { NotificationCategory, Tone } from "@/lib/types";
import { useCareflow } from "@/lib/store";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/data/states";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const categoryMeta: Record<
  NotificationCategory,
  { label: string; icon: typeof BellRing }
> = {
  appointments: { label: "Appointments", icon: CalendarDays },
  tasks: { label: "Tasks", icon: ClipboardList },
  leads: { label: "Leads", icon: Waypoints },
  "follow-ups": { label: "Follow-ups", icon: Timer },
  complaints: { label: "Complaints", icon: MessageSquareWarning },
  system: { label: "System", icon: ServerCrash },
  security: { label: "Security", icon: ShieldCheck },
};

const toneRing: Record<Tone, string> = {
  success: "border-success-line bg-success-soft text-success",
  warning: "border-warning-line bg-warning-soft text-warning",
  danger: "border-danger-line bg-danger-soft text-danger",
  info: "border-info-line bg-info-soft text-info",
  ai: "border-ai-line bg-ai-soft text-ai",
  neutral: "border-line bg-surface-2 text-ink-3",
};

const filters = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "complaints", label: "Complaints" },
  { id: "follow-ups", label: "Follow-ups" },
  { id: "system", label: "System" },
] as const;

export function NotificationDrawer() {
  const open = useCareflow((s) => s.notificationsOpen);
  const setOpen = useCareflow((s) => s.setNotificationsOpen);
  const notifications = useCareflow((s) => s.notifications);
  const markRead = useCareflow((s) => s.markNotificationRead);
  const markAllRead = useCareflow((s) => s.markAllNotificationsRead);
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");

  const visible = notifications.filter((n) => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.read;
    return n.category === filter;
  });
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="gap-1 border-b border-line px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="text-h3">Notifications</SheetTitle>
            {unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-body-sm text-primary hover:text-primary-hover"
                onClick={markAllRead}
              >
                Mark all read
              </Button>
            )}
          </div>
          <SheetDescription className="text-body-sm text-ink-3">
            {unread > 0 ? `${unread} unread` : "You are all caught up"}
          </SheetDescription>
        </SheetHeader>

        <div
          role="tablist"
          aria-label="Filter notifications"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-3 py-2"
        >
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1 text-body-sm transition-colors duration-150 cursor-pointer",
                filter === f.id
                  ? "bg-primary-soft font-medium text-primary-soft-fg"
                  : "text-ink-3 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <EmptyState
              icon={BellRing}
              title="Nothing here"
              description="Notifications matching this filter will appear as they arrive."
              compact
            />
          ) : (
            <ul className="divide-y divide-line">
              {visible.map((n) => {
                const meta = categoryMeta[n.category];
                const Icon = meta.icon;
                return (
                  <li key={n.id}>
                    <Link
                      href={n.href}
                      onClick={() => {
                        markRead(n.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-2",
                        !n.read && "bg-primary-soft/35",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md border",
                          toneRing[n.tone],
                        )}
                      >
                        <Icon aria-hidden className="size-3.5" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 text-body-sm font-medium text-ink">
                            {n.title}
                          </span>
                          <time className="shrink-0 text-caption text-ink-3">
                            {relativeTime(n.createdAt)}
                          </time>
                        </span>
                        <span className="mt-0.5 block text-body-sm text-ink-3">
                          {n.body}
                        </span>
                        <span className="mt-1.5 flex items-center gap-2">
                          <span className="text-caption text-ink-3">{meta.label}</span>
                          {!n.read && (
                            <span className="inline-flex items-center gap-1 text-caption font-medium text-primary">
                              <span
                                aria-hidden
                                className="size-1.5 rounded-full bg-primary"
                              />
                              Unread
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
