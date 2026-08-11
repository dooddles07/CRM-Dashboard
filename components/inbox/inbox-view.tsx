"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AtSign,
  MessageCircle,
  MessageSquare,
  Phone,
  Send,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";
import type { Channel, Conversation, Message } from "@/lib/types";
import { conversations } from "@/lib/data/patient-record";
import { patientById, staffName } from "@/lib/data/people";
import { useViewer } from "@/components/shell/viewer-context";
import { relativeTime, formatTime } from "@/lib/format";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const channelIcon: Record<Channel, typeof MessageSquare> = {
  sms: MessageSquare,
  email: AtSign,
  whatsapp: MessageCircle,
  call: Phone,
};

export function InboxView() {
  const viewer = useViewer();
  const sorted = useMemo(
    () => conversations.slice().sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1)),
    [],
  );
  const [selectedId, setSelectedId] = useState(sorted[0]?.id ?? "");
  const [read, setRead] = useState<Record<string, boolean>>({});
  const [extra, setExtra] = useState<Record<string, Message[]>>({});
  const [draft, setDraft] = useState("");
  const [internal, setInternal] = useState(false);
  const seq = useRef(0);

  const active = sorted.find((c) => c.id === selectedId);

  function select(c: Conversation) {
    setSelectedId(c.id);
    setRead((r) => ({ ...r, [c.id]: true }));
  }

  function send() {
    if (!draft.trim() || !active) return;
    seq.current += 1;
    const msg: Message = {
      id: `m-new-${seq.current}`,
      direction: "outbound",
      channel: active.channel,
      body: draft.trim(),
      sentAt: new Date().toISOString(),
      authorId: viewer.staffId,
      internal,
    };
    setExtra((e) => ({ ...e, [active.id]: [...(e[active.id] ?? []), msg] }));
    setDraft("");
    toast(internal ? "Internal note added" : "Message sent", {
      description: internal ? "Visible to staff only." : `Delivered to the patient by ${active.channel.toUpperCase()}.`,
    });
    setInternal(false);
  }

  const messages = active ? [...active.messages, ...(extra[active.id] ?? [])] : [];

  return (
    <div className="grid h-[calc(100svh-10.5rem)] grid-cols-1 overflow-hidden rounded-lg border border-line bg-surface shadow-card md:grid-cols-[20rem_1fr]">
      {/* Conversation list */}
      <div className="flex min-h-0 flex-col border-r border-line">
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <p className="text-h3 text-ink">Conversations</p>
          <span className="text-caption text-ink-3 tabular-nums">{sorted.length}</span>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {sorted.map((c) => {
            const patient = patientById(c.patientId);
            const Icon = channelIcon[c.channel];
            const unread = c.unread && !read[c.id];
            const preview = [...c.messages, ...(extra[c.id] ?? [])].at(-1);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => select(c)}
                  className={cn(
                    "flex w-full items-start gap-2.5 border-b border-line px-3 py-2.5 text-left transition-colors cursor-pointer",
                    c.id === selectedId ? "bg-primary-soft/50" : "hover:bg-surface-2",
                  )}
                >
                  <div className="relative">
                    <PersonAvatar name={patient?.name ?? "Unknown"} id={c.patientId} size="sm" initials={patient?.initials} />
                    <span className="absolute -bottom-0.5 -right-0.5 inline-flex size-4 items-center justify-center rounded-full border border-surface bg-surface-3 text-ink-3">
                      <Icon className="size-2.5" strokeWidth={2} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn("truncate text-body-sm", unread ? "font-semibold text-ink" : "font-medium text-ink")}>
                        {patient?.name ?? c.patientId}
                      </p>
                      <span className="shrink-0 text-caption text-ink-3 tabular-nums">{relativeTime(c.lastMessageAt)}</span>
                    </div>
                    <p className="truncate text-caption text-ink-3">{c.subject}</p>
                    {preview && <p className={cn("truncate text-caption", unread ? "text-ink-2" : "text-ink-3")}>{preview.body}</p>}
                  </div>
                  {unread && <span aria-label="Unread" className="mt-1 size-2 shrink-0 rounded-full bg-info-solid" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Thread */}
      {active ? (
        <div className="flex min-h-0 flex-col">
          <ThreadHeader conversation={active} />
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface-2/40 px-4 py-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </div>
          <div className="border-t border-line p-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder={internal ? "Write an internal note…" : `Reply by ${active.channel.toUpperCase()}…`}
              className="resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setInternal((v) => !v)}
                aria-pressed={internal}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-caption transition-colors cursor-pointer",
                  internal ? "bg-warning-soft text-warning" : "text-ink-3 hover:bg-surface-2 hover:text-ink",
                )}
              >
                <StickyNote className="size-3.5" strokeWidth={2} />
                Internal note
              </button>
              <Button size="sm" onClick={send} disabled={!draft.trim()}>
                <Send className="size-3.5" strokeWidth={2} />
                {internal ? "Add note" : "Send"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center p-8 text-body-sm text-ink-3">
          Select a conversation to read it.
        </div>
      )}
    </div>
  );
}

function ThreadHeader({ conversation }: { conversation: Conversation }) {
  const patient = patientById(conversation.patientId);
  const Icon = channelIcon[conversation.channel];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <PersonAvatar name={patient?.name ?? "Unknown"} id={conversation.patientId} size="sm" initials={patient?.initials} />
        <div className="min-w-0">
          <Link href={`/patients/${conversation.patientId}`} className="font-medium text-ink hover:text-primary">
            {patient?.name ?? conversation.patientId}
          </Link>
          <p className="flex items-center gap-1.5 text-caption text-ink-3">
            <Icon className="size-3" strokeWidth={2} />
            {conversation.subject}
          </p>
        </div>
      </div>
      <p className="text-caption text-ink-3">Assigned to {staffName(conversation.assignedTo ?? "")}</p>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.internal) {
    return (
      <div className="mx-auto max-w-xl rounded-md border border-warning-line bg-warning-soft px-3 py-2">
        <p className="mb-0.5 flex items-center gap-1.5 text-label text-warning">
          <StickyNote className="size-3" strokeWidth={2.25} />
          Internal note · {message.authorId ? staffName(message.authorId) : "Staff"}
        </p>
        <p className="text-body-sm text-ink-2">{message.body}</p>
        <p className="mt-1 text-caption text-ink-3 tabular-nums">{formatTime(message.sentAt)}</p>
      </div>
    );
  }

  const outbound = message.direction === "outbound";
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg border px-3 py-2",
          outbound ? "border-primary-line bg-primary-soft" : "border-line bg-surface",
        )}
      >
        <p className={cn("text-body-sm", outbound ? "text-primary-soft-fg" : "text-ink")}>{message.body}</p>
        <p className={cn("mt-1 text-caption tabular-nums", outbound ? "text-primary-soft-fg/70" : "text-ink-3")}>
          {message.authorId ? staffName(message.authorId) : outbound ? "Automated" : "Patient"} · {formatTime(message.sentAt)}
        </p>
      </div>
    </div>
  );
}
