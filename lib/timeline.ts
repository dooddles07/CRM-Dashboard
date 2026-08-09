import type { Patient, TimelineEvent } from "./types";
import { appointmentStatus, followUpStatus } from "./status";
import { departmentName } from "./data/constants";
import { doctorById, staffName } from "./data/people";
import { appointmentsFor } from "./data/scheduling";
import { followUpsFor, tasksFor } from "./data/work";
import {
  conversationsFor,
  extraTimeline,
  feedbackFor,
  notesFor,
  referralsForPatient,
} from "./data/patient-record";

/**
 * The Spine. Every record type a patient touches collapses into one
 * chronological sequence, so staff read history in the order it happened
 * rather than by hunting through tabs.
 */
export function buildTimeline(patient: Patient): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const a of appointmentsFor(patient.id)) {
    const meta = appointmentStatus[a.status];
    const doctor = doctorById(a.doctorId);
    events.push({
      id: `tl-ap-${a.id}`,
      subjectId: patient.id,
      kind: "appointment",
      title: `${a.type} appointment · ${meta.label.toLowerCase()}`,
      // The doctor is named here, so the actor line would only repeat it.
      detail: `${doctor?.name ?? "Unassigned"} · ${departmentName(a.departmentId)} · ${a.reason}`,
      at: `${a.date}T${a.start}:00`,
      actor: null,
      tone: meta.tone,
    });
  }

  for (const f of followUpsFor(patient.id)) {
    const meta = followUpStatus[f.status];
    events.push({
      id: `tl-fu-${f.id}`,
      subjectId: patient.id,
      kind: "follow-up",
      title: `${f.type} follow-up ${meta.label.toLowerCase()}`,
      detail: f.note,
      at: `${f.dueDate}T09:00:00`,
      actor: staffName(f.ownerId),
      tone: meta.tone,
    });
  }

  for (const c of conversationsFor(patient.id)) {
    for (const m of c.messages) {
      const kind =
        m.channel === "call" ? "call" : m.channel === "email" ? "email" : "message";
      events.push({
        id: `tl-msg-${m.id}`,
        subjectId: patient.id,
        kind,
        title: m.internal
          ? "Internal note on the conversation"
          : m.direction === "inbound"
            ? `Patient replied by ${m.channel === "call" ? "phone" : m.channel.toUpperCase()}`
            : m.channel === "call"
              ? "Call placed"
              : `${m.channel.toUpperCase()} sent`,
        detail: m.body,
        at: m.sentAt,
        actor: m.authorId ? staffName(m.authorId) : null,
        tone: m.internal ? "neutral" : m.direction === "inbound" ? "info" : "neutral",
      });
    }
  }

  for (const t of tasksFor(patient.id)) {
    events.push({
      id: `tl-tk-${t.id}`,
      subjectId: patient.id,
      kind: "task",
      title: t.status === "done" ? "Task completed" : "Task created",
      detail: t.title,
      at: `${t.dueDate}T08:00:00`,
      actor: staffName(t.ownerId),
      tone: t.status === "done" ? "success" : "neutral",
    });
  }

  for (const f of feedbackFor(patient.id)) {
    events.push({
      id: `tl-fb-${f.id}`,
      subjectId: patient.id,
      kind: "feedback",
      title: `Feedback submitted · ${f.rating} of 5`,
      detail: f.comment,
      at: f.submittedAt,
      actor: null,
      tone: f.rating >= 4 ? "success" : f.rating === 3 ? "warning" : "danger",
    });
  }

  for (const r of referralsForPatient(patient.name)) {
    events.push({
      id: `tl-rf-${r.id}`,
      subjectId: patient.id,
      kind: "referral",
      title: `Referral ${r.status}`,
      detail: `${r.provider} · ${departmentName(r.departmentId)}`,
      at: `${r.receivedAt}T08:30:00`,
      actor: staffName(r.ownerId),
      tone: r.status === "declined" ? "neutral" : "info",
    });
  }

  for (const n of notesFor(patient.id)) {
    events.push({
      id: `tl-nt-${n.id}`,
      subjectId: patient.id,
      kind: "note",
      title: "Internal note added",
      detail: n.body,
      at: n.createdAt,
      actor: n.author,
      tone: "neutral",
    });
  }

  events.push(...extraTimeline.filter((e) => e.subjectId === patient.id));

  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Groups events under Today / Yesterday / a date, preserving order. */
export function groupTimeline(events: TimelineEvent[]) {
  const groups: { key: string; events: TimelineEvent[] }[] = [];
  for (const event of events) {
    const key = event.at.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.events.push(event);
    else groups.push({ key, events: [event] });
  }
  return groups;
}
