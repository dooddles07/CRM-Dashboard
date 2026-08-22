"use client";

import Link from "next/link";
import {
  CalendarDays,
  Download,
  FileText,
  Handshake,
  MessageSquare,
  Paperclip,
  Pin,
  Star,
  Timer,
} from "lucide-react";
import type {
  RecordAppointment,
  RecordConversation,
  RecordDocument,
  RecordFeedback,
  RecordFollowUp,
  RecordNote,
  RecordReferral,
} from "@/lib/server/services/patient-record";
import { appointmentStatus, followUpStatus, priorityMeta, referralStatus } from "@/lib/status";
import { formatDate, formatDateShort, formatTime, relativeDay, relativeTime } from "@/lib/format";
import { Panel, PanelHeader } from "@/components/data/panel";
import { EmptyState } from "@/components/data/states";
import { StatusChip } from "@/components/healthcare/status-chip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */

export function AppointmentsTab({ items }: { items: RecordAppointment[] }) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={CalendarDays}
        title="No appointments yet"
        description="Book the first appointment and it will appear here with its full history."
        action={<Button size="sm">Book appointment</Button>}
      />
    );

  return (
    <ul className="divide-y divide-line">
      {items.map((a) => (
        <li key={a.reference} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
          <div className="w-24 shrink-0">
            <p className="text-body-sm font-medium text-ink tabular-nums">
              {formatDateShort(a.startsAt)}
            </p>
            <p className="text-caption text-ink-3 tabular-nums">{formatTime(a.startsAt)}</p>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-body-sm font-medium text-ink">{a.type}</p>
              <StatusChip meta={appointmentStatus[a.status]} />
            </div>
            <p className="mt-0.5 text-body-sm text-ink-3">
              {a.doctor?.name ?? "Unassigned"} · {a.department ?? "Unassigned"}
              {a.location ? ` · ${a.location}` : ""}
            </p>
            {a.reason && <p className="mt-1 text-body-sm text-ink-2">{a.reason}</p>}
            {a.notes && (
              <p className="mt-1 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-body-sm text-ink-3">
                {a.notes}
              </p>
            )}
          </div>
          <span className="text-ident text-ink-3">{a.reference}</span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */

export function CommunicationsTab({ items }: { items: RecordConversation[] }) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={MessageSquare}
        title="No conversations yet"
        description="Messages and logged calls with this patient will appear here."
        action={
          <Button size="sm" asChild>
            <Link href="/inbox?compose=1">Send a message</Link>
          </Button>
        }
      />
    );

  return (
    <ul className="divide-y divide-line">
      {items.map((c) => (
        <li key={c.reference} className="flex flex-wrap items-start justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="text-body-sm font-medium text-ink">{c.subject}</p>
            <p className="mt-0.5 text-body-sm text-ink-3">
              {c.channel.toUpperCase()} · {c.messageCount} message{c.messageCount === 1 ? "" : "s"}
              {c.assignedTo ? ` · ${c.assignedTo}` : ""}
            </p>
          </div>
          <time className="shrink-0 text-caption text-ink-3">{relativeTime(c.lastMessageAt)}</time>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */

export function FollowUpsTab({ items }: { items: RecordFollowUp[] }) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={Timer}
        title="No follow-ups"
        description="Create one to make sure this patient is contacted after their next visit."
        action={<Button size="sm">Create follow-up</Button>}
      />
    );

  return (
    <ul className="divide-y divide-line">
      {items.map((f) => (
        <li key={f.reference} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-body-sm font-medium text-ink">{f.type}</p>
              <StatusChip meta={followUpStatus[f.status]} />
              <StatusChip meta={priorityMeta[f.priority]} />
            </div>
            {f.note && <p className="mt-1 text-body-sm text-ink-3">{f.note}</p>}
          </div>
          <div className="text-right">
            <p
              className={cn(
                "text-body-sm tabular-nums",
                f.status === "overdue" ? "font-medium text-danger" : "text-ink",
              )}
            >
              {relativeDay(f.dueDate)}
            </p>
            <p className="text-caption text-ink-3">{f.owner ?? "Unassigned"}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */

export function ReferralsTab({ items }: { items: RecordReferral[] }) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={Handshake}
        title="No referrals"
        description="Referrals from partner clinics, physicians, or insurers will appear here."
      />
    );

  return (
    <ul className="divide-y divide-line">
      {items.map((r) => (
        <li key={r.reference} className="flex flex-wrap items-start justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-body-sm font-medium text-ink">{r.provider}</p>
              <StatusChip meta={referralStatus[r.status]} />
            </div>
            <p className="mt-0.5 text-body-sm text-ink-3">
              {r.providerType}
              {r.department ? ` · ${r.department}` : ""} · received {formatDate(r.receivedAt)}
            </p>
            {r.outcome && <p className="mt-1 text-body-sm text-ink-2">{r.outcome}</p>}
          </div>
          <span className="text-ident text-ink-3">{r.reference}</span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */

export function FeedbackTab({ items }: { items: RecordFeedback[] }) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={Star}
        title="No feedback yet"
        description="Survey responses after an appointment will appear here with their rating."
      />
    );

  return (
    <ul className="divide-y divide-line">
      {items.map((f) => (
        <li key={f.reference} className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5" aria-label={`${f.rating} out of 5`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    aria-hidden
                    className={cn(
                      "size-3.5",
                      i < f.rating
                        ? "fill-warning-solid text-warning-solid"
                        : "text-line-strong",
                    )}
                    strokeWidth={2}
                  />
                ))}
              </span>
              <span className="text-body-sm font-medium text-ink">{f.category}</span>
            </div>
            <time className="text-caption text-ink-3">{formatDate(f.submittedAt)}</time>
          </div>
          {f.comment && <p className="mt-1.5 text-body-sm leading-5 text-ink-2">{f.comment}</p>}
          {(f.doctor || f.department) && (
            <p className="mt-1 text-caption text-ink-3">
              {f.doctor ?? "Unassigned"} · {f.department ?? "Unassigned"}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */

export function DocumentsTab({ items }: { items: RecordDocument[] }) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={Paperclip}
        title="No documents attached"
        description="Consent forms, referral letters, and insurance confirmations attached to this record will appear here."
        action={<Button size="sm">Upload document</Button>}
      />
    );

  return (
    <ul className="divide-y divide-line">
      {items.map((d) => (
        <li key={d.reference} className="flex items-center gap-3 px-4 py-2.5">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-ink-3">
            <FileText aria-hidden className="size-4" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-medium text-ink">{d.label}</p>
            <p className="text-caption text-ink-3">
              {d.category} · {Math.round(d.sizeBytes / 1024)} KB
              {d.uploadedBy ? ` · ${d.uploadedBy}` : ""} · {relativeTime(d.createdAt)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Download ${d.label}`}
            disabled={!d.downloadable}
          >
            <Download className="size-4" strokeWidth={1.9} />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */

export function NotesTab({ items }: { items: RecordNote[] }) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={FileText}
        title="No internal notes"
        description="Notes are visible to staff with access to this patient and are never sent to them."
        action={<Button size="sm">Add note</Button>}
      />
    );

  return (
    <ul className="divide-y divide-line">
      {items.map((n) => (
        <li key={n.reference} className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-body-sm leading-5 text-ink">{n.body}</p>
            {n.pinned && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-warning-line bg-warning-soft px-1.5 py-0.5 text-caption font-medium text-warning">
                <Pin aria-hidden className="size-3" strokeWidth={2.25} />
                Pinned
              </span>
            )}
          </div>
          <p className="mt-1 text-caption text-ink-3">
            {n.author ?? "Unknown"} · {formatDate(n.createdAt)} {formatTime(n.createdAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */

export function TabPanel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title={title} description={description} actions={actions} />
      {children}
    </Panel>
  );
}
