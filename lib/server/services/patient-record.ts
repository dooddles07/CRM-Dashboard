import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { assert, type AuthzSession } from "@/lib/server/authz/policy";
import { withSession } from "@/lib/server/db/session";
import { conversations, messages } from "@/lib/server/db/schema/comms";
import { feedback } from "@/lib/server/db/schema/experience";
import { departments } from "@/lib/server/db/schema/org";
import {
  doctors,
  patientDocuments,
  patientNotes,
  patients,
  staff,
} from "@/lib/server/db/schema/people";
import { referrals } from "@/lib/server/db/schema/pipeline";
import { appointments } from "@/lib/server/db/schema/scheduling";
import { followUps } from "@/lib/server/db/schema/work";
import { fromDbEnum } from "@/lib/server/db/enum-map";
import type { AppointmentStatus, FollowUpStatus, ReferralStatus } from "@/lib/types";
import { NotFoundError } from "./errors";

/**
 * Everything `/patients/[id]` renders, in one transaction.
 *
 * The record page has eight tabs, each counting and listing a different
 * collection. Fetching them from eight separate services would be eight
 * round trips and eight `withSession` transactions, each re-declaring the
 * same context — so they are assembled here instead, under one.
 *
 * This is the exception to "one service per resource", and the reason is
 * specific: a record page is a join, not a list. The tab counts have to agree
 * with the tab contents, and they only do so reliably if both come from the
 * same snapshot.
 *
 * Every collection is scoped by the patient, and the patient is scoped by
 * row-level security, so a caller who cannot see the patient gets a 404
 * before any of the rest runs.
 */

export interface RecordAppointment {
  reference: string;
  type: string;
  status: AppointmentStatus;
  startsAt: string;
  durationMinutes: number;
  location: string | null;
  reason: string | null;
  doctor: { reference: string; name: string } | null;
  department: string | null;
}

export interface RecordFollowUp {
  reference: string;
  type: string;
  dueDate: string;
  status: FollowUpStatus;
  note: string | null;
  owner: string | null;
}

export interface RecordConversation {
  reference: string;
  subject: string;
  channel: string;
  lastMessageAt: string;
  messageCount: number;
  assignedTo: string | null;
}

export interface RecordReferral {
  reference: string;
  provider: string;
  providerType: string;
  receivedAt: string;
  status: ReferralStatus;
  outcome: string | null;
}

export interface RecordFeedback {
  reference: string;
  rating: number;
  category: string;
  comment: string | null;
  submittedAt: string;
}

export interface RecordDocument {
  reference: string;
  label: string;
  category: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: string | null;
  /** False when the blob was never uploaded — the row renders and the download 404s. */
  downloadable: boolean;
}

export interface RecordNote {
  reference: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  author: string | null;
}

export interface PatientRecordBundle {
  emergencyContact: { name: string; relation: string; phone: string } | null;
  appointments: RecordAppointment[];
  followUps: RecordFollowUp[];
  openFollowUpCount: number;
  conversations: RecordConversation[];
  referrals: RecordReferral[];
  feedback: RecordFeedback[];
  documents: RecordDocument[];
  notes: RecordNote[];
}

export async function bundle(
  session: AuthzSession,
  reference: string,
): Promise<PatientRecordBundle> {
  assert(session, "patients", "view");

  return withSession(session, async (tx) => {
    const [patient] = await tx
      .select({ id: patients.id, emergencyContact: patients.emergencyContact })
      .from(patients)
      .where(eq(patients.reference, reference))
      .limit(1);

    if (!patient) throw new NotFoundError("That patient could not be found.", { reference });
    const id = patient.id;

    const appointmentRows = await tx
      .select({
        reference: appointments.reference,
        type: appointments.type,
        status: appointments.status,
        startsAt: appointments.startsAt,
        durationMinutes: appointments.durationMinutes,
        location: appointments.location,
        reason: appointments.reason,
        doctorReference: doctors.reference,
        doctorName: doctors.name,
        departmentName: departments.name,
      })
      .from(appointments)
      .leftJoin(doctors, eq(doctors.id, appointments.doctorId))
      .leftJoin(departments, eq(departments.id, appointments.departmentId))
      .where(eq(appointments.patientId, id))
      .orderBy(desc(appointments.startsAt));

    const followUpRows = await tx
      .select({
        reference: followUps.reference,
        type: followUps.type,
        dueDate: followUps.dueDate,
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
      .where(eq(followUps.patientId, id))
      .orderBy(asc(followUps.dueDate));

    const conversationRows = await tx
      .select({
        reference: conversations.reference,
        subject: conversations.subject,
        channel: conversations.channel,
        lastMessageAt: conversations.lastMessageAt,
        assignedName: staff.name,
        messageCount: sql<number>`
          (SELECT count(*)::int FROM ${messages}
           WHERE ${messages.conversationId} = ${conversations.id})`,
      })
      .from(conversations)
      .leftJoin(staff, eq(staff.id, conversations.assignedTo))
      .where(eq(conversations.patientId, id))
      .orderBy(desc(conversations.lastMessageAt));

    const referralRows = await tx
      .select({
        reference: referrals.reference,
        provider: referrals.provider,
        providerType: referrals.providerType,
        receivedAt: referrals.receivedAt,
        status: referrals.status,
        outcome: referrals.outcome,
      })
      .from(referrals)
      .where(eq(referrals.patientId, id))
      .orderBy(desc(referrals.receivedAt));

    const feedbackRows = await tx
      .select({
        reference: feedback.reference,
        rating: feedback.rating,
        category: feedback.category,
        comment: feedback.comment,
        submittedAt: feedback.submittedAt,
      })
      .from(feedback)
      .where(eq(feedback.patientId, id))
      .orderBy(desc(feedback.submittedAt));

    const documentRows = await tx
      .select({
        reference: patientDocuments.reference,
        label: patientDocuments.label,
        category: patientDocuments.category,
        contentType: patientDocuments.contentType,
        sizeBytes: patientDocuments.sizeBytes,
        createdAt: patientDocuments.createdAt,
        blobKey: patientDocuments.blobKey,
        uploadedByName: staff.name,
      })
      .from(patientDocuments)
      .leftJoin(staff, eq(staff.id, patientDocuments.uploadedBy))
      .where(and(eq(patientDocuments.patientId, id), isNull(patientDocuments.archivedAt)))
      .orderBy(desc(patientDocuments.createdAt));

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
      .where(eq(patientNotes.patientId, id))
      // Pinned first, then newest — the order the notes panel renders.
      .orderBy(desc(patientNotes.pinned), desc(patientNotes.createdAt));

    return {
      emergencyContact: patient.emergencyContact ?? null,
      appointments: appointmentRows.map((row) => ({
        reference: row.reference,
        type: row.type,
        status: fromDbEnum(row.status) as AppointmentStatus,
        startsAt: row.startsAt.toISOString(),
        durationMinutes: row.durationMinutes,
        location: row.location,
        reason: row.reason,
        doctor:
          row.doctorReference && row.doctorName
            ? { reference: row.doctorReference, name: row.doctorName }
            : null,
        department: row.departmentName,
      })),
      followUps: followUpRows.map((row) => ({
        reference: row.reference,
        type: row.type,
        dueDate: row.dueDate,
        status: row.status as FollowUpStatus,
        note: row.note,
        owner: row.ownerName,
      })),
      openFollowUpCount: followUpRows.filter(
        (row) => row.status === "pending" || row.status === "overdue",
      ).length,
      conversations: conversationRows.map((row) => ({
        reference: row.reference,
        subject: row.subject,
        channel: fromDbEnum(row.channel),
        lastMessageAt: row.lastMessageAt.toISOString(),
        messageCount: Number(row.messageCount ?? 0),
        assignedTo: row.assignedName,
      })),
      referrals: referralRows.map((row) => ({
        reference: row.reference,
        provider: row.provider,
        providerType: row.providerType,
        receivedAt: row.receivedAt.toISOString(),
        status: fromDbEnum(row.status) as ReferralStatus,
        outcome: row.outcome,
      })),
      feedback: feedbackRows.map((row) => ({
        reference: row.reference,
        rating: Number(row.rating),
        category: row.category,
        comment: row.comment,
        submittedAt: row.submittedAt.toISOString(),
      })),
      documents: documentRows.map((row) => ({
        reference: row.reference,
        label: row.label,
        category: row.category,
        contentType: row.contentType,
        sizeBytes: Number(row.sizeBytes),
        createdAt: row.createdAt.toISOString(),
        uploadedBy: row.uploadedByName,
        // `blob_key` is nullable so the seed's eight documents exist as
        // metadata without invented file bodies. A row with none renders in
        // the list and 404s on download, which is honest about what it is.
        downloadable: row.blobKey !== null,
      })),
      notes: noteRows.map((row) => ({
        reference: row.reference,
        body: row.body,
        pinned: row.pinned,
        createdAt: row.createdAt.toISOString(),
        author: row.authorName,
      })),
    };
  });
}
