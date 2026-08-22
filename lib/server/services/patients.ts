import { and, asc, count, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { assert, type AuthzSession } from "@/lib/server/authz/policy";
import { writeAudit, writeFieldUpdates, type AuditContext } from "@/lib/server/audit/write";
import { withSession, type Tx } from "@/lib/server/db/session";
import { maskContact, type MaskedField } from "@/lib/server/mask/serialize";
import {
  addressCityOf,
  emailDomainOf,
  encryptPii,
  encryptPiiRequired,
  phoneLast2Of,
} from "@/lib/server/db/pii";
import { generateReference } from "@/lib/server/db/reference";
import { departments } from "@/lib/server/db/schema/org";
import { doctors, patients, patientTags, tags } from "@/lib/server/db/schema/people";
import { followUps } from "@/lib/server/db/schema/work";
import type { Channel, PatientStatus } from "@/lib/types";
import { fromDbEnum, toDbEnum } from "@/lib/server/db/enum-map";
import { NotFoundError, mappingDatabaseErrors } from "./errors";
import { paginate, resolvePage, type PageRequest, type Paginated } from "./pagination";

/**
 * plan/04-service-layer.md §2, §9. The reference service — every other module
 * follows this shape.
 *
 * ## The rule that does the work
 *
 * **No Drizzle row type is exported, and no function returns one.** plan §2.1:
 * "Therefore no Server Component can receive one, therefore no Client
 * Component can be handed an unmasked phone number. This is risk R2 closed by
 * the compiler rather than by review."
 *
 * In practice that means this module never names `InferSelectModel<typeof
 * patients>` at all. The plan suggests declaring it locally as a line of
 * discipline, but an unused local type is dead code — the property that
 * matters is the absence of the *export*, not the presence of the
 * declaration. Every query projects into a DTO explicitly, so
 * `phone_encrypted` is absent by construction rather than filtered out
 * afterwards, and patch types are written by hand rather than as
 * `Partial<Row>`.
 *
 * ## Every function takes `session` first
 *
 * Non-optional, first position, reads included. Forgetting the check is
 * possible; forgetting the argument is a compile error, and the argument is
 * useless unless checked, so review has one thing to look for. It also means
 * a script cannot call these without deciding what identity it runs as.
 */

export interface PatientListDTO {
  reference: string;
  name: string;
  initials: string;
  age: number | null;
  department: { id: string; name: string } | null;
  doctor: { reference: string; name: string } | null;
  status: PatientStatus;
  tags: string[];
  lastVisit: string | null;
  nextAppointment: string | null;
  outstandingFollowUps: number;
  /** On the list DTO because /patients filters by it. Not a contact detail. */
  insurance: string | null;
  phone: MaskedField;
  email: MaskedField;
}

export interface PatientDetailDTO extends PatientListDTO {
  gender: string;
  registeredAt: string;
  source: string;
  satisfaction: number | null;
  notes: string | null;
  preferredChannel: string;
  address: MaskedField;
  dateOfBirth: MaskedField;
  archived: boolean;
}

export interface PatientFilters extends PageRequest {
  /** Trigram-indexed on `name`; see idx_patients_name_trgm. */
  search?: string;
  status?: PatientStatus;
  departmentId?: string;
  doctorId?: string;
  /** Archived rows are excluded unless this is true. Soft delete, never a DELETE. */
  includeArchived?: boolean;
  sort?: "name" | "lastVisit" | "registeredAt";
}

export interface NewPatient {
  name: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  emergencyContact?: { name: string; relation: string; phone: string } | null;
  preferredChannel?: Channel;
  departmentId?: string | null;
  /** A doctor's business reference, resolved to the FK inside `create`'s own transaction. */
  doctorReference?: string | null;
  source: string;
  insurance?: string | null;
  tags?: string[];
  notes?: string | null;
}

/**
 * Declared separately rather than as `Partial<PatientRow>` (plan §2.1's second
 * corollary). Contact details are absent on purpose: changing a phone number
 * is a different operation from editing a record, it has to re-derive
 * `phone_last2`, and letting it through here would put plaintext into an
 * `updated` audit entry's `new_value`.
 */
export interface PatientPatch {
  name?: string;
  status?: PatientStatus;
  departmentId?: string | null;
  doctorId?: string | null;
  insurance?: string | null;
  notes?: string | null;
  nextAppointment?: string | null;
}

/** Derived, not stored — `initials` exists on the fixtures but not on the table. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** Whole years, from a date-only column. Null when the date is missing or unparseable. */
function ageFrom(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const born = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - born.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}

/**
 * The projection every read shares. Explicit column list, never `select *` —
 * `phone_encrypted` and friends are absent by construction rather than by
 * being filtered out later.
 *
 * `tags` and `outstandingFollowUps` are correlated subqueries rather than
 * joins so that one row comes back per patient. A `LEFT JOIN patient_tags`
 * would multiply rows by tag count and quietly break the `total` a paginated
 * list reports.
 */
const listProjection = {
  reference: patients.reference,
  name: patients.name,
  dateOfBirth: patients.dateOfBirth,
  status: patients.status,
  lastVisit: patients.lastVisit,
  nextAppointment: patients.nextAppointment,
  phoneLast2: patients.phoneLast2,
  emailDomain: patients.emailDomain,
  addressCity: patients.addressCity,
  insurance: patients.insurance,
  archivedAt: patients.archivedAt,
  departmentId: departments.id,
  departmentName: departments.name,
  doctorReference: doctors.reference,
  doctorName: doctors.name,
  tagLabels: sql<string[]>`
    coalesce(
      (SELECT array_agg(${tags.label} ORDER BY ${tags.label})
       FROM ${patientTags}
       JOIN ${tags} ON ${tags.id} = ${patientTags.tagId}
       WHERE ${patientTags.patientId} = ${patients.id}),
      '{}'
    )`.as("tag_labels"),
  outstandingFollowUps: sql<number>`
    (SELECT count(*)::int FROM ${followUps}
     WHERE ${followUps.patientId} = ${patients.id} AND ${followUps.completedAt} IS NULL)`.as(
    "outstanding_follow_ups",
  ),
};

type ListRow = {
  [K in keyof typeof listProjection]: K extends "tagLabels"
    ? string[]
    : K extends "outstandingFollowUps"
      ? number
      : string | null;
};

function toListDTO(session: AuthzSession, row: ListRow): PatientListDTO {
  const contact = maskContact(session, {
    phoneLast2: row.phoneLast2 as string | null,
    emailDomain: row.emailDomain as string | null,
  });
  return {
    reference: row.reference as string,
    name: row.name as string,
    initials: initialsOf(row.name as string),
    age: ageFrom(row.dateOfBirth as string | null),
    department:
      row.departmentId && row.departmentName
        ? { id: row.departmentId as string, name: row.departmentName as string }
        : null,
    doctor:
      row.doctorReference && row.doctorName
        ? { reference: row.doctorReference as string, name: row.doctorName as string }
        : null,
    status: fromDbEnum(row.status as string) as PatientStatus,
    tags: row.tagLabels ?? [],
    lastVisit: row.lastVisit as string | null,
    nextAppointment: row.nextAppointment as string | null,
    outstandingFollowUps: row.outstandingFollowUps ?? 0,
    insurance: (row.insurance as string | null) ?? null,
    phone: contact.phone,
    email: contact.email,
  };
}

/**
 * plan §9. Row scope is Postgres's answer, not a `WHERE` clause here — a
 * Nurse sees their department's patients because of the policy in
 * drizzle/manual/0007, and this function contains nothing that says so. The
 * only filtering below is what the caller asked for.
 */
export async function list(
  session: AuthzSession,
  filters: PatientFilters = {},
): Promise<Paginated<PatientListDTO>> {
  assert(session, "patients", "view");
  const { page, perPage, offset } = resolvePage(filters);

  return withSession(session, async (tx) => {
    const where = and(
      filters.includeArchived ? undefined : isNull(patients.archivedAt),
      filters.search ? ilike(patients.name, `%${filters.search}%`) : undefined,
      filters.status ? eq(patients.status, toDbEnum(filters.status)) : undefined,
      filters.departmentId ? eq(patients.departmentId, filters.departmentId) : undefined,
      filters.doctorId ? eq(patients.doctorId, filters.doctorId) : undefined,
    );

    const order =
      filters.sort === "name"
        ? asc(patients.name)
        : filters.sort === "registeredAt"
          ? desc(patients.registeredAt)
          : desc(sql`coalesce(${patients.lastVisit}, ${patients.registeredAt})`);

    const rows = await tx
      .select(listProjection)
      .from(patients)
      .leftJoin(departments, eq(departments.id, patients.departmentId))
      .leftJoin(doctors, eq(doctors.id, patients.doctorId))
      .where(where)
      .orderBy(order)
      .limit(perPage)
      .offset(offset);

    // Counted separately and inside the same transaction, so the total agrees
    // with the page under the same row-level scope.
    const [totals] = await tx.select({ total: count() }).from(patients).where(where);

    return paginate(
      rows.map((row) => toListDTO(session, row as unknown as ListRow)),
      totals?.total ?? 0,
      page,
      perPage,
    );
  });
}

/**
 * plan §4.2: opening an individual record writes a `viewed` entry. List
 * screens deliberately do not — "logging every page view of /patients would
 * bury the entries that matter under noise, and the list carries no unmasked
 * data."
 *
 * `context` is optional so a read can be performed without one (a job, a
 * report). When it is absent no `viewed` entry is written, which is honest:
 * there is no actor context to attribute it to.
 */
export async function byReference(
  session: AuthzSession,
  reference: string,
  context?: AuditContext,
): Promise<PatientDetailDTO> {
  assert(session, "patients", "view");

  return withSession(session, async (tx) => {
    const row = await selectDetail(tx, session, eq(patients.reference, reference), reference);
    if (context) {
      await writeAudit(tx, session, context, {
        action: "viewed",
        resourceType: "patient",
        resourceId: reference,
      });
    }
    return row;
  });
}

/** The detail projection, in one place so `byReference`, `create` and `update` agree. */
const detailProjection = {
  ...listProjection,
  gender: patients.gender,
  registeredAt: patients.registeredAt,
  source: patients.source,
  satisfaction: patients.satisfaction,
  notes: patients.notes,
  preferredChannel: patients.preferredChannel,
};

async function selectDetail(
  tx: Tx,
  session: AuthzSession,
  where: ReturnType<typeof eq>,
  reference: string,
): Promise<PatientDetailDTO> {
  const [row] = await tx
    .select(detailProjection)
    .from(patients)
    .leftJoin(departments, eq(departments.id, patients.departmentId))
    .leftJoin(doctors, eq(doctors.id, patients.doctorId))
    .where(where)
    .limit(1);

  // Not found and hidden-by-policy are the same answer. plan/03 §8: "out of
  // scope is indistinguishable from not existing", because a 403 confirms the
  // record exists.
  if (!row) throw new NotFoundError("That patient could not be found.", { reference });

  return toDetailDTO(session, row as Record<string, unknown>);
}

function toDetailDTO(session: AuthzSession, row: Record<string, unknown>): PatientDetailDTO {
  const base = toListDTO(session, row as unknown as ListRow);
  const contact = maskContact(session, {
    phoneLast2: row.phoneLast2 as string | null,
    emailDomain: row.emailDomain as string | null,
    addressCity: row.addressCity as string | null,
    dateOfBirth: row.dateOfBirth as string | null,
  });
  return {
    ...base,
    gender: row.gender as string,
    registeredAt: row.registeredAt as string,
    source: row.source as string,
    satisfaction: row.satisfaction === null ? null : Number(row.satisfaction),
    notes: (row.notes as string | null) ?? null,
    preferredChannel: fromDbEnum(row.preferredChannel as string),
    address: contact.address,
    dateOfBirth: contact.dateOfBirth,
    archived: row.archivedAt !== null,
  };
}

/**
 * plan/06-screen-migration.md §5: `/patients/new` "submits via `createPatient`
 * action". Encrypts the contact fields and derives their fragments the same
 * way `scripts/seed.ts` does, so a created patient masks identically to a
 * seeded one.
 *
 * `full` is not required — this is not the destructive operation `full` gates
 * (plan/03 §1); `edit` already covers write access to the resource.
 */
export async function create(
  session: AuthzSession,
  input: NewPatient,
  context: AuditContext,
): Promise<PatientDetailDTO> {
  assert(session, "patients", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const ref = await generateReference("patient", async (candidate) => {
        const [existing] = await tx
          .select({ id: patients.id })
          .from(patients)
          .where(eq(patients.reference, candidate))
          .limit(1);
        return Boolean(existing);
      });

      // Resolved in this same transaction, the way `appointments.create`
      // resolves its doctor/patient references — one round trip and one
      // connection for the whole write, rather than a caller doing this
      // lookup in a transaction of its own before calling here.
      let doctorId: string | null = null;
      if (input.doctorReference) {
        const [doctor] = await tx
          .select({ id: doctors.id })
          .from(doctors)
          .where(and(eq(doctors.reference, input.doctorReference), isNull(doctors.archivedAt)))
          .limit(1);
        if (!doctor) {
          throw new NotFoundError("That doctor could not be found.", {
            reference: input.doctorReference,
          });
        }
        doctorId = doctor.id;
      }

      const [inserted] = await tx
        .insert(patients)
        .values({
          reference: ref,
          name: input.name,
          dateOfBirth: input.dateOfBirth,
          gender: input.gender,
          phoneEncrypted: encryptPiiRequired(input.phone),
          emailEncrypted: encryptPii(input.email ?? null),
          addressEncrypted: encryptPii(input.address ?? null),
          phoneLast2: phoneLast2Of(input.phone),
          emailDomain: input.email ? emailDomainOf(input.email) : null,
          addressCity: input.address ? addressCityOf(input.address) : null,
          emergencyContact: input.emergencyContact ?? null,
          preferredChannel: input.preferredChannel ? toDbEnum(input.preferredChannel) : undefined,
          departmentId: input.departmentId ?? null,
          doctorId,
          registeredAt: new Date().toISOString().slice(0, 10),
          status: toDbEnum("new"),
          insurance: input.insurance ?? null,
          source: input.source,
          notes: input.notes ?? null,
        })
        .returning({ id: patients.id, reference: patients.reference });

      const labels = [...new Set(input.tags ?? [])];
      if (labels.length > 0) {
        const tagRows = await tx
          .insert(tags)
          .values(labels.map((label) => ({ label })))
          .onConflictDoUpdate({ target: tags.label, set: { label: sql`excluded.label` } })
          .returning({ id: tags.id });
        await tx
          .insert(patientTags)
          .values(tagRows.map((t) => ({ patientId: inserted.id, tagId: t.id })))
          .onConflictDoNothing();
      }

      await writeAudit(tx, session, context, {
        action: "created",
        resourceType: "patient",
        resourceId: inserted.reference,
        newValue: input.name,
      });

      return selectDetail(tx, session, eq(patients.id, inserted.id), inserted.reference);
    }),
  );
}

/**
 * plan §4.2: every update writes one audit entry per changed field, with
 * `field`, `previousValue` and `newValue`.
 *
 * `full` is not required — `edit` is. Archiving is the destructive operation
 * and it has its own function below.
 */
export async function update(
  session: AuthzSession,
  reference: string,
  patch: PatientPatch,
  context: AuditContext,
): Promise<PatientDetailDTO> {
  assert(session, "patients", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [before] = await tx
        .select({
          id: patients.id,
          name: patients.name,
          status: patients.status,
          departmentId: patients.departmentId,
          doctorId: patients.doctorId,
          insurance: patients.insurance,
          notes: patients.notes,
          nextAppointment: patients.nextAppointment,
        })
        .from(patients)
        .where(eq(patients.reference, reference))
        .limit(1);

      if (!before) throw new NotFoundError("That patient could not be found.", { reference });

      const next = {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.status !== undefined ? { status: toDbEnum(patch.status) } : {}),
        ...(patch.departmentId !== undefined ? { departmentId: patch.departmentId } : {}),
        ...(patch.doctorId !== undefined ? { doctorId: patch.doctorId } : {}),
        ...(patch.insurance !== undefined ? { insurance: patch.insurance } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.nextAppointment !== undefined
          ? { nextAppointment: patch.nextAppointment }
          : {}),
      };

      if (Object.keys(next).length > 0) {
        await tx
          .update(patients)
          .set({ ...next, updatedAt: new Date() })
          .where(eq(patients.id, before.id));

        // Inside the same transaction as the write. An entry that commits
        // independently can describe an update that rolled back.
        await writeFieldUpdates(
          tx,
          session,
          context,
          { type: "patient", id: reference },
          before,
          next,
        );
      }

      return selectDetail(tx, session, eq(patients.id, before.id), reference);
    }),
  );
}

/**
 * Soft delete. plan/01-foundation.md keeps `archived_at` rather than deleting,
 * and docs/SECURITY.md §2.6's dialog promises that "appointment history,
 * notes, and the audit trail are kept".
 *
 * Requires `full`, not `edit` — plan/03 §1: "`full` adds destructive
 * operations — archive, delete, bulk action — on top of `edit`."
 */
export async function archive(
  session: AuthzSession,
  reference: string,
  reason: string,
  context: AuditContext,
): Promise<void> {
  assert(session, "patients", "full");

  await withSession(session, async (tx) => {
    const [row] = await tx
      .select({ id: patients.id, archivedAt: patients.archivedAt })
      .from(patients)
      .where(eq(patients.reference, reference))
      .limit(1);

    if (!row) throw new NotFoundError("That patient could not be found.", { reference });
    if (row.archivedAt) return; // Already archived; nothing to record.

    await tx
      .update(patients)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(patients.id, row.id));

    await writeAudit(tx, session, context, {
      action: "deleted",
      resourceType: "patient",
      resourceId: reference,
      field: "archivedAt",
      newValue: reason,
    });
  });
}

/** Restore is the same privilege as archive, and writes its own entry. */
export async function restore(
  session: AuthzSession,
  reference: string,
  context: AuditContext,
): Promise<void> {
  assert(session, "patients", "full");

  await withSession(session, async (tx) => {
    const [row] = await tx
      .select({ id: patients.id, archivedAt: patients.archivedAt })
      .from(patients)
      .where(eq(patients.reference, reference))
      .limit(1);

    if (!row) throw new NotFoundError("That patient could not be found.", { reference });
    if (!row.archivedAt) return;

    await tx
      .update(patients)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(patients.id, row.id));

    await writeAudit(tx, session, context, {
      action: "updated",
      resourceType: "patient",
      resourceId: reference,
      field: "archivedAt",
      previousValue: row.archivedAt.toISOString(),
      newValue: null,
    });
  });
}
