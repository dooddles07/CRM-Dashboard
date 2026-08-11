import { and, asc, count, eq, gte, lt, sql } from "drizzle-orm";
import { assert, type AuthzSession } from "@/lib/server/authz/policy";
import { writeAudit, writeFieldUpdates, type AuditContext } from "@/lib/server/audit/write";
import { withSession, type Tx } from "@/lib/server/db/session";
import { departments } from "@/lib/server/db/schema/org";
import { doctors, patients } from "@/lib/server/db/schema/people";
import { appointments } from "@/lib/server/db/schema/scheduling";
import { fromDbEnum, toDbEnum } from "@/lib/server/db/enum-map";
import type { AppointmentStatus } from "@/lib/types";
import { NotFoundError, mappingDatabaseErrors } from "./errors";
import { paginate, resolvePage, type PageRequest, type Paginated } from "./pagination";

/**
 * plan/04-service-layer.md §9: "Conflict is the database's answer, not a
 * pre-check."
 *
 * That is the whole reason this module looks the way it does. A pre-check —
 * "is this slot free?" then "insert" — races: two requests both read a free
 * slot, both insert, and the second wins silently. The GiST exclusion
 * constraint in drizzle/manual/0003_no_double_booking.sql cannot be raced,
 * because the check and the write are the same operation.
 *
 * So `create` and `reschedule` do not look before they leap. They insert, and
 * translate SQLSTATE 23P01 into a 409 `SLOT_CONFLICT` through
 * `mappingDatabaseErrors`. plan §11: "A double-booked appointment surfaces as
 * 409 SLOT_CONFLICT, never a 500."
 *
 * Note the constraint excludes cancelled and no-show rows, so cancelling frees
 * the slot without deleting the record — the history survives, which is what
 * the audit trail and the patient timeline both need.
 */

export interface AppointmentDTO {
  reference: string;
  patient: { reference: string; name: string };
  doctor: { reference: string; name: string };
  department: { id: string; name: string };
  type: string;
  startsAt: string;
  durationMinutes: number;
  location: string | null;
  status: AppointmentStatus;
  reason: string | null;
  notes: string | null;
}

export interface AppointmentFilters extends PageRequest {
  /** Inclusive ISO date-time; pairs with `until` to bound a calendar view. */
  from?: string;
  until?: string;
  doctorId?: string;
  departmentId?: string;
  status?: AppointmentStatus;
}

export interface NewAppointment {
  patientReference: string;
  doctorReference: string;
  type: string;
  startsAt: string;
  durationMinutes: number;
  location?: string | null;
  reason?: string | null;
}

export interface AppointmentPatch {
  startsAt?: string;
  durationMinutes?: number;
  location?: string | null;
  status?: AppointmentStatus;
  notes?: string | null;
}

const projection = {
  reference: appointments.reference,
  type: appointments.type,
  startsAt: appointments.startsAt,
  durationMinutes: appointments.durationMinutes,
  location: appointments.location,
  status: appointments.status,
  reason: appointments.reason,
  notes: appointments.notes,
  patientReference: patients.reference,
  patientName: patients.name,
  doctorReference: doctors.reference,
  doctorName: doctors.name,
  departmentId: departments.id,
  departmentName: departments.name,
};

function toDTO(row: Record<string, unknown>): AppointmentDTO {
  return {
    reference: row.reference as string,
    patient: {
      reference: row.patientReference as string,
      name: row.patientName as string,
    },
    doctor: {
      reference: row.doctorReference as string,
      name: row.doctorName as string,
    },
    department: {
      id: row.departmentId as string,
      name: row.departmentName as string,
    },
    type: row.type as string,
    startsAt: (row.startsAt as Date).toISOString(),
    durationMinutes: row.durationMinutes as number,
    location: (row.location as string | null) ?? null,
    status: fromDbEnum(row.status as string) as AppointmentStatus,
    reason: (row.reason as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  };
}

function joined(tx: Tx) {
  return tx
    .select(projection)
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .innerJoin(doctors, eq(doctors.id, appointments.doctorId))
    .innerJoin(departments, eq(departments.id, appointments.departmentId));
}

export async function list(
  session: AuthzSession,
  filters: AppointmentFilters = {},
): Promise<Paginated<AppointmentDTO>> {
  assert(session, "appointments", "view");
  const { page, perPage, offset } = resolvePage(filters);

  return withSession(session, async (tx) => {
    const where = and(
      filters.from ? gte(appointments.startsAt, new Date(filters.from)) : undefined,
      filters.until ? lt(appointments.startsAt, new Date(filters.until)) : undefined,
      filters.doctorId ? eq(appointments.doctorId, filters.doctorId) : undefined,
      filters.departmentId ? eq(appointments.departmentId, filters.departmentId) : undefined,
      filters.status ? eq(appointments.status, toDbEnum(filters.status)) : undefined,
    );

    const rows = await joined(tx)
      .where(where)
      .orderBy(asc(appointments.startsAt))
      .limit(perPage)
      .offset(offset);

    const [totals] = await tx.select({ total: count() }).from(appointments).where(where);

    return paginate(
      rows.map((row) => toDTO(row as Record<string, unknown>)),
      totals?.total ?? 0,
      page,
      perPage,
    );
  });
}

export async function byReference(
  session: AuthzSession,
  reference: string,
): Promise<AppointmentDTO> {
  assert(session, "appointments", "view");

  return withSession(session, async (tx) => {
    const [row] = await joined(tx).where(eq(appointments.reference, reference)).limit(1);
    if (!row) throw new NotFoundError("That appointment could not be found.", { reference });
    return toDTO(row as Record<string, unknown>);
  });
}

/**
 * No availability pre-check. The exclusion constraint is the check, and it is
 * the only one that cannot be raced — see this module's header.
 *
 * The department is taken from the doctor rather than from the caller: an
 * appointment's department decides who can see it under row-level security,
 * and letting a client choose it would let a caller file a record into a
 * department they cannot otherwise read.
 */
export async function create(
  session: AuthzSession,
  input: NewAppointment,
  context: AuditContext,
): Promise<AppointmentDTO> {
  assert(session, "appointments", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [patient] = await tx
        .select({ id: patients.id })
        .from(patients)
        .where(eq(patients.reference, input.patientReference))
        .limit(1);
      if (!patient) {
        throw new NotFoundError("That patient could not be found.", {
          reference: input.patientReference,
        });
      }

      const [doctor] = await tx
        .select({ id: doctors.id, departmentId: doctors.departmentId })
        .from(doctors)
        .where(eq(doctors.reference, input.doctorReference))
        .limit(1);
      if (!doctor?.departmentId) {
        throw new NotFoundError("That doctor could not be found.", {
          reference: input.doctorReference,
        });
      }

      const reference = `AP-${Date.now().toString(36).toUpperCase()}`;

      const [created] = await tx
        .insert(appointments)
        .values({
          reference,
          patientId: patient.id,
          doctorId: doctor.id,
          departmentId: doctor.departmentId,
          type: input.type,
          startsAt: new Date(input.startsAt),
          durationMinutes: input.durationMinutes,
          location: input.location ?? null,
          reason: input.reason ?? null,
        })
        .returning({ id: appointments.id });

      await writeAudit(tx, session, context, {
        action: "created",
        resourceType: "appointment",
        resourceId: reference,
        newValue: `${input.type} at ${input.startsAt}`,
      });

      const [row] = await joined(tx).where(eq(appointments.id, created.id)).limit(1);
      return toDTO(row as Record<string, unknown>);
    }),
  );
}

/**
 * Rescheduling and status changes share a path, because both can collide with
 * the exclusion constraint: moving a slot can overlap another, and taking an
 * appointment *out* of `cancelled` re-enters it into the constraint's scope.
 */
export async function update(
  session: AuthzSession,
  reference: string,
  patch: AppointmentPatch,
  context: AuditContext,
): Promise<AppointmentDTO> {
  assert(session, "appointments", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [before] = await tx
        .select({
          id: appointments.id,
          startsAt: appointments.startsAt,
          durationMinutes: appointments.durationMinutes,
          location: appointments.location,
          status: appointments.status,
          notes: appointments.notes,
        })
        .from(appointments)
        .where(eq(appointments.reference, reference))
        .limit(1);

      if (!before) throw new NotFoundError("That appointment could not be found.", { reference });

      const next = {
        ...(patch.startsAt !== undefined ? { startsAt: new Date(patch.startsAt) } : {}),
        ...(patch.durationMinutes !== undefined
          ? { durationMinutes: patch.durationMinutes }
          : {}),
        ...(patch.location !== undefined ? { location: patch.location } : {}),
        ...(patch.status !== undefined ? { status: toDbEnum(patch.status) } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      };

      if (Object.keys(next).length > 0) {
        await tx
          .update(appointments)
          .set({ ...next, updatedAt: new Date() })
          .where(eq(appointments.id, before.id));

        await writeFieldUpdates(
          tx,
          session,
          context,
          { type: "appointment", id: reference },
          before,
          next,
        );
      }

      const [row] = await joined(tx).where(eq(appointments.id, before.id)).limit(1);
      return toDTO(row as Record<string, unknown>);
    }),
  );
}

/**
 * Cancelling is a status change, not a delete. The exclusion constraint's
 * `WHERE status NOT IN ('cancelled','no_show')` means this frees the slot
 * while the record — and the patient's timeline — survives.
 */
export async function cancel(
  session: AuthzSession,
  reference: string,
  reason: string,
  context: AuditContext,
): Promise<AppointmentDTO> {
  return update(session, reference, { status: "cancelled", notes: reason }, context);
}

/**
 * plan §9 lists availability as this service's concern. Reported, never
 * enforced: this answers "what looks free" for a picker, and the constraint
 * answers "what is free" at the moment of writing. A caller must not treat a
 * gap here as a reservation.
 */
export async function bookedSlots(
  session: AuthzSession,
  doctorReference: string,
  from: string,
  until: string,
): Promise<{ startsAt: string; durationMinutes: number }[]> {
  assert(session, "appointments", "view");

  return withSession(session, async (tx) => {
    const rows = await tx
      .select({
        startsAt: appointments.startsAt,
        durationMinutes: appointments.durationMinutes,
      })
      .from(appointments)
      .innerJoin(doctors, eq(doctors.id, appointments.doctorId))
      .where(
        and(
          eq(doctors.reference, doctorReference),
          gte(appointments.startsAt, new Date(from)),
          lt(appointments.startsAt, new Date(until)),
          sql`${appointments.status} NOT IN ('cancelled','no_show')`,
        ),
      )
      .orderBy(asc(appointments.startsAt));

    return rows.map((row) => ({
      startsAt: row.startsAt.toISOString(),
      durationMinutes: row.durationMinutes,
    }));
  });
}
