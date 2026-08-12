import { desc, eq, sql } from "drizzle-orm";
import { assert, type AuthzSession } from "@/lib/server/authz/policy";
import { withSession } from "@/lib/server/db/session";
import { conversations, messages } from "@/lib/server/db/schema/comms";
import { feedback } from "@/lib/server/db/schema/experience";
import { departments } from "@/lib/server/db/schema/org";
import { doctors, patientNotes, patients, staff } from "@/lib/server/db/schema/people";
import { referrals } from "@/lib/server/db/schema/pipeline";
import { appointments } from "@/lib/server/db/schema/scheduling";
import { followUps, tasks } from "@/lib/server/db/schema/work";
import { fromDbEnum } from "@/lib/server/db/enum-map";
import { appointmentStatus, followUpStatus } from "@/lib/status";
import type { AppointmentStatus, FollowUpStatus, TimelineEvent, Tone } from "@/lib/types";
import { NotFoundError } from "./errors";

/**
 * The Spine, server side. plan/06-screen-migration.md §5: "`lib/timeline.ts`
 * already does this and keeps working, now over DTOs instead of seed arrays."
 *
 * In practice the merging logic could not simply be pointed at DTOs: it reads
 * six seed modules through synchronous lookup helpers (`appointmentsFor`,
 * `notesFor`, `doctorById`) that have no database equivalent, and calling six
 * services from a client component would be six round trips. So the shape it
 * produces — `TimelineEvent[]`, one chronological sequence — is preserved
 * exactly, and the assembly moves here where it can be seven queries in one
 * transaction under one row-level-security context.
 *
 * `lib/timeline.ts` stays for `/design-system` and is now the only consumer
 * of those seed helpers on this path.
 *
 * Every query runs inside the same `withSession`, so a caller who cannot see
 * the patient gets an empty timeline rather than a partial one — and the
 * `byReference` check ahead of them turns that into a 404 instead.
 */

/** Message bodies are excluded on purpose — see `conversationEvents`. */
export async function forPatient(
  session: AuthzSession,
  reference: string,
): Promise<TimelineEvent[]> {
  assert(session, "patients", "view");

  return withSession(session, async (tx) => {
    const [patient] = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.reference, reference))
      .limit(1);

    // Out of scope and absent are the same answer, as everywhere else.
    if (!patient) throw new NotFoundError("That patient could not be found.", { reference });

    const id = patient.id;
    const events: TimelineEvent[] = [];

    const appointmentRows = await tx
      .select({
        reference: appointments.reference,
        type: appointments.type,
        status: appointments.status,
        startsAt: appointments.startsAt,
        reason: appointments.reason,
        doctorName: doctors.name,
        departmentName: departments.name,
      })
      .from(appointments)
      .leftJoin(doctors, eq(doctors.id, appointments.doctorId))
      .leftJoin(departments, eq(departments.id, appointments.departmentId))
      .where(eq(appointments.patientId, id));

    for (const row of appointmentRows) {
      const status = fromDbEnum(row.status) as AppointmentStatus;
      const meta = appointmentStatus[status];
      events.push({
        id: `tl-ap-${row.reference}`,
        subjectId: reference,
        kind: "appointment",
        title: `${row.type} appointment · ${meta.label.toLowerCase()}`,
        // The doctor is named here, so the actor line would only repeat it.
        detail: `${row.doctorName ?? "Unassigned"} · ${row.departmentName ?? "Unassigned"}${row.reason ? ` · ${row.reason}` : ""}`,
        at: row.startsAt.toISOString(),
        actor: null,
        tone: meta.tone,
      });
    }

    const followUpRows = await tx
      .select({
        reference: followUps.reference,
        type: followUps.type,
        dueDate: followUps.dueDate,
        completedAt: followUps.completedAt,
        note: followUps.note,
        ownerName: staff.name,
        status: sql<string>`
          CASE WHEN ${followUps.completedAt} IS NOT NULL THEN 'completed'
               WHEN ${followUps.dueDate} < CURRENT_DATE  THEN 'overdue'
               WHEN ${followUps.dueDate} = CURRENT_DATE  THEN 'pending'
               ELSE 'scheduled' END`,
      })
      .from(followUps)
      .leftJoin(staff, eq(staff.id, followUps.ownerId))
      .where(eq(followUps.patientId, id));

    for (const row of followUpRows) {
      const meta = followUpStatus[row.status as FollowUpStatus];
      events.push({
        id: `tl-fu-${row.reference}`,
        subjectId: reference,
        kind: "follow-up",
        title: `${row.type} follow-up · ${meta.label.toLowerCase()}`,
        detail: row.note,
        // Completed follow-ups sit at their completion, open ones at their due
        // date, so the sequence reads as what happened rather than what was
        // planned.
        at: (row.completedAt ?? new Date(`${row.dueDate}T09:00:00Z`)).toISOString(),
        actor: row.ownerName,
        tone: meta.tone,
      });
    }

    events.push(...(await conversationEvents(tx, id, reference)));

    const taskRows = await tx
      .select({
        reference: tasks.reference,
        title: tasks.title,
        category: tasks.category,
        status: tasks.status,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        ownerName: staff.name,
      })
      .from(tasks)
      .leftJoin(staff, eq(staff.id, tasks.ownerId))
      .where(eq(tasks.patientId, id));

    for (const row of taskRows) {
      events.push({
        id: `tl-tk-${row.reference}`,
        subjectId: reference,
        kind: "task",
        title: row.title,
        detail: row.category,
        at: (row.completedAt ?? new Date(`${row.dueDate}T09:00:00Z`)).toISOString(),
        actor: row.ownerName,
        tone: row.completedAt ? "success" : "neutral",
      });
    }

    const feedbackRows = await tx
      .select({
        reference: feedback.reference,
        rating: feedback.rating,
        category: feedback.category,
        comment: feedback.comment,
        submittedAt: feedback.submittedAt,
      })
      .from(feedback)
      .where(eq(feedback.patientId, id));

    for (const row of feedbackRows) {
      events.push({
        id: `tl-fb-${row.reference}`,
        subjectId: reference,
        kind: "feedback",
        title: `Feedback · ${row.rating}/5 · ${row.category}`,
        detail: row.comment,
        at: row.submittedAt.toISOString(),
        actor: null,
        tone: row.rating >= 4 ? "success" : row.rating >= 3 ? "warning" : "danger",
      });
    }

    const referralRows = await tx
      .select({
        reference: referrals.reference,
        provider: referrals.provider,
        providerType: referrals.providerType,
        receivedAt: referrals.receivedAt,
        outcome: referrals.outcome,
      })
      .from(referrals)
      .where(eq(referrals.patientId, id));

    for (const row of referralRows) {
      events.push({
        id: `tl-rf-${row.reference}`,
        subjectId: reference,
        kind: "referral",
        title: `Referred by ${row.provider}`,
        detail: row.outcome ?? row.providerType,
        at: row.receivedAt.toISOString(),
        actor: null,
        tone: "info",
      });
    }

    const noteRows = await tx
      .select({
        reference: patientNotes.reference,
        body: patientNotes.body,
        pinned: patientNotes.pinned,
        createdAt: patientNotes.createdAt,
        authorName: staff.name,
      })
      .from(patientNotes)
      .leftJoin(staff, eq(staff.id, patientNotes.authorId))
      .where(eq(patientNotes.patientId, id));

    for (const row of noteRows) {
      events.push({
        id: `tl-nt-${row.reference}`,
        subjectId: reference,
        kind: "note",
        title: row.pinned ? "Pinned note" : "Note",
        detail: row.body,
        at: row.createdAt.toISOString(),
        actor: row.authorName,
        tone: "neutral",
      });
    }

    // Reverse chronological, newest first — the order the Spine renders.
    return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  });
}

/**
 * Conversation messages, summarised rather than reproduced.
 *
 * The timeline says a message was sent and by whom; it does not carry the
 * body. A patient's record page is read by more people than the inbox thread
 * is, and an internal clinical note quoted into the Spine would be visible to
 * everyone who can open the record. The thread itself is where bodies belong,
 * behind `conversations.thread`.
 */
async function conversationEvents(
  tx: Parameters<Parameters<typeof withSession>[1]>[0],
  patientId: string,
  reference: string,
): Promise<TimelineEvent[]> {
  const rows = await tx
    .select({
      id: messages.id,
      direction: messages.direction,
      channel: messages.channel,
      internal: messages.internal,
      sentAt: messages.sentAt,
      subject: conversations.subject,
      authorName: staff.name,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .leftJoin(staff, eq(staff.id, messages.authorId))
    .where(eq(conversations.patientId, patientId))
    .orderBy(desc(messages.sentAt));

  return rows.map((row) => {
    const direction = fromDbEnum(row.direction);
    const channel = fromDbEnum(row.channel).toUpperCase();
    return {
      id: `tl-ms-${row.id}`,
      subjectId: reference,
      kind: "message" as const,
      title: row.internal
        ? `Internal note · ${row.subject}`
        : `${direction === "inbound" ? "Received" : "Sent"} ${channel} · ${row.subject}`,
      detail: null,
      at: row.sentAt.toISOString(),
      actor: row.authorName,
      tone: (row.internal ? "neutral" : "info") as Tone,
    };
  });
}
