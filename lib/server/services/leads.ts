import { and, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { assert, type AuthzSession } from "@/lib/server/authz/policy";
import { writeAudit, writeFieldUpdates, type AuditContext } from "@/lib/server/audit/write";
import { withSession } from "@/lib/server/db/session";
import { maskLeadContact } from "@/lib/server/mask/serialize";
import type { MaskedField } from "@/lib/server/mask/serialize";
import { departments } from "@/lib/server/db/schema/org";
import { patients, staff } from "@/lib/server/db/schema/people";
import { leadStageHistory, leads } from "@/lib/server/db/schema/pipeline";
import { fromDbEnum, toDbEnum } from "@/lib/server/db/enum-map";
import type { LeadStage, Priority } from "@/lib/types";
import { ConflictError, NotFoundError, mappingDatabaseErrors } from "./errors";
import { paginate, resolvePage, type PageRequest, type Paginated } from "./pagination";

/**
 * plan/04-service-layer.md §9: "Stage move writes `lead_stage_history` in the
 * same transaction."
 *
 * Two things distinguish this module from patients:
 *
 * 1. A lead's contact details have no fragment columns beside them, so its
 *    masks carry no hint — see `maskLeadContact`. A lead list decrypts
 *    nothing, same as a patient list, but shows dots rather than the last two
 *    digits.
 * 2. Conversion is a transaction spanning two tables and two audit entries
 *    (plan §7). It either all happens or none of it does.
 */

export interface LeadDTO {
  reference: string;
  name: string;
  source: string;
  department: { id: string; name: string } | null;
  interest: string | null;
  stage: LeadStage;
  owner: { reference: string; name: string } | null;
  priority: Priority;
  valueCents: number;
  inquiry: string | null;
  createdAt: string;
  lastContactAt: string | null;
  nextFollowUp: string | null;
  convertedPatientReference: string | null;
  phone: MaskedField;
  email: MaskedField;
}

export interface LeadFilters extends PageRequest {
  stage?: LeadStage;
  departmentId?: string;
  ownerId?: string;
  priority?: Priority;
  /** The board hides converted leads by default; the list can show them. */
  includeConverted?: boolean;
}

export interface NewLead {
  name: string;
  source: string;
  departmentId?: string | null;
  interest?: string | null;
  priority?: Priority;
  valueCents?: number;
  inquiry?: string | null;
  ownerId?: string | null;
}

export interface LeadPatch {
  name?: string;
  interest?: string | null;
  priority?: Priority;
  valueCents?: number;
  ownerId?: string | null;
  departmentId?: string | null;
  nextFollowUp?: string | null;
}

const projection = {
  reference: leads.reference,
  name: leads.name,
  source: leads.source,
  interest: leads.interest,
  stage: leads.stage,
  priority: leads.priority,
  valueCents: leads.valueCents,
  inquiry: leads.inquiry,
  createdAt: leads.createdAt,
  lastContactAt: leads.lastContactAt,
  nextFollowUp: leads.nextFollowUp,
  departmentId: departments.id,
  departmentName: departments.name,
  ownerReference: staff.reference,
  ownerName: staff.name,
  convertedPatientReference: patients.reference,
  // Existence, not content. The encrypted columns are never selected.
  hasPhone: sql<boolean>`${leads.phoneEncrypted} IS NOT NULL`.as("has_phone"),
  hasEmail: sql<boolean>`${leads.emailEncrypted} IS NOT NULL`.as("has_email"),
};

function toDTO(session: AuthzSession, row: Record<string, unknown>): LeadDTO {
  const contact = maskLeadContact(session, {
    phone: Boolean(row.hasPhone),
    email: Boolean(row.hasEmail),
  });
  return {
    reference: row.reference as string,
    name: row.name as string,
    source: row.source as string,
    department:
      row.departmentId && row.departmentName
        ? { id: row.departmentId as string, name: row.departmentName as string }
        : null,
    interest: (row.interest as string | null) ?? null,
    stage: fromDbEnum(row.stage as string) as LeadStage,
    owner:
      row.ownerReference && row.ownerName
        ? { reference: row.ownerReference as string, name: row.ownerName as string }
        : null,
    priority: fromDbEnum(row.priority as string) as Priority,
    valueCents: Number(row.valueCents ?? 0),
    inquiry: (row.inquiry as string | null) ?? null,
    createdAt: (row.createdAt as Date).toISOString(),
    lastContactAt: (row.lastContactAt as Date | null)?.toISOString() ?? null,
    nextFollowUp: (row.nextFollowUp as string | null) ?? null,
    convertedPatientReference: (row.convertedPatientReference as string | null) ?? null,
    phone: contact.phone,
    email: contact.email,
  };
}

export async function list(
  session: AuthzSession,
  filters: LeadFilters = {},
): Promise<Paginated<LeadDTO>> {
  assert(session, "pipeline", "view");
  const { page, perPage, offset } = resolvePage(filters);

  return withSession(session, async (tx) => {
    const where = and(
      filters.includeConverted ? undefined : isNull(leads.convertedPatientId),
      filters.stage ? eq(leads.stage, toDbEnum(filters.stage)) : undefined,
      filters.departmentId ? eq(leads.departmentId, filters.departmentId) : undefined,
      filters.ownerId ? eq(leads.ownerId, filters.ownerId) : undefined,
      filters.priority ? eq(leads.priority, toDbEnum(filters.priority)) : undefined,
    );

    const rows = await tx
      .select(projection)
      .from(leads)
      .leftJoin(departments, eq(departments.id, leads.departmentId))
      .leftJoin(staff, eq(staff.id, leads.ownerId))
      .leftJoin(patients, eq(patients.id, leads.convertedPatientId))
      .where(where)
      .orderBy(desc(leads.createdAt))
      .limit(perPage)
      .offset(offset);

    const [totals] = await tx.select({ total: count() }).from(leads).where(where);

    return paginate(
      rows.map((row) => toDTO(session, row as Record<string, unknown>)),
      totals?.total ?? 0,
      page,
      perPage,
    );
  });
}

export async function byReference(session: AuthzSession, reference: string): Promise<LeadDTO> {
  assert(session, "pipeline", "view");

  return withSession(session, async (tx) => {
    const [row] = await tx
      .select(projection)
      .from(leads)
      .leftJoin(departments, eq(departments.id, leads.departmentId))
      .leftJoin(staff, eq(staff.id, leads.ownerId))
      .leftJoin(patients, eq(patients.id, leads.convertedPatientId))
      .where(eq(leads.reference, reference))
      .limit(1);

    if (!row) throw new NotFoundError("That lead could not be found.", { reference });
    return toDTO(session, row as Record<string, unknown>);
  });
}

export async function update(
  session: AuthzSession,
  reference: string,
  patch: LeadPatch,
  context: AuditContext,
): Promise<LeadDTO> {
  assert(session, "pipeline", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [before] = await tx
        .select({
          id: leads.id,
          name: leads.name,
          interest: leads.interest,
          priority: leads.priority,
          valueCents: leads.valueCents,
          ownerId: leads.ownerId,
          departmentId: leads.departmentId,
          nextFollowUp: leads.nextFollowUp,
        })
        .from(leads)
        .where(eq(leads.reference, reference))
        .limit(1);

      if (!before) throw new NotFoundError("That lead could not be found.", { reference });

      const next = {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.interest !== undefined ? { interest: patch.interest } : {}),
        ...(patch.priority !== undefined ? { priority: toDbEnum(patch.priority) } : {}),
        ...(patch.valueCents !== undefined ? { valueCents: patch.valueCents } : {}),
        ...(patch.ownerId !== undefined ? { ownerId: patch.ownerId } : {}),
        ...(patch.departmentId !== undefined ? { departmentId: patch.departmentId } : {}),
        ...(patch.nextFollowUp !== undefined ? { nextFollowUp: patch.nextFollowUp } : {}),
      };

      if (Object.keys(next).length > 0) {
        await tx.update(leads).set(next).where(eq(leads.id, before.id));
        await writeFieldUpdates(tx, session, context, { type: "lead", id: reference }, before, next);
      }
      return byReferenceIn(tx, session, reference);
    }),
  );
}

/**
 * plan §9: the stage move and its history row are one transaction.
 *
 * `lead_stage_history` is the record of how a lead travelled, and a move that
 * updated the stage without appending to it would leave the board correct and
 * the history a lie.
 */
export async function moveStage(
  session: AuthzSession,
  reference: string,
  toStage: LeadStage,
  context: AuditContext,
): Promise<LeadDTO> {
  assert(session, "pipeline", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [before] = await tx
        .select({ id: leads.id, stage: leads.stage, converted: leads.convertedPatientId })
        .from(leads)
        .where(eq(leads.reference, reference))
        .limit(1);

      if (!before) throw new NotFoundError("That lead could not be found.", { reference });

      const target = toDbEnum(toStage);
      if (before.stage === target) return byReferenceIn(tx, session, reference);

      // A converted lead has become a patient. Moving it back onto the board
      // would leave two records claiming the same person is in the pipeline.
      if (before.converted) {
        throw new ConflictError(
          "CONFLICT",
          "That lead has already been converted to a patient and cannot be moved.",
          { reference },
        );
      }

      await tx.update(leads).set({ stage: target }).where(eq(leads.id, before.id));
      await tx.insert(leadStageHistory).values({
        leadId: before.id,
        fromStage: before.stage,
        toStage: target,
        movedBy: session.staffId,
      });
      await writeAudit(tx, session, context, {
        action: "updated",
        resourceType: "lead",
        resourceId: reference,
        field: "stage",
        previousValue: fromDbEnum(before.stage),
        newValue: toStage,
      });

      return byReferenceIn(tx, session, reference);
    }),
  );
}

/** The stage history a lead detail page renders. Ordered oldest first. */
export async function stageHistory(
  session: AuthzSession,
  reference: string,
): Promise<{ from: LeadStage | null; to: LeadStage; at: string; by: string | null }[]> {
  assert(session, "pipeline", "view");

  return withSession(session, async (tx) => {
    const rows = await tx
      .select({
        fromStage: leadStageHistory.fromStage,
        toStage: leadStageHistory.toStage,
        movedAt: leadStageHistory.movedAt,
        movedByName: staff.name,
      })
      .from(leadStageHistory)
      .innerJoin(leads, eq(leads.id, leadStageHistory.leadId))
      .leftJoin(staff, eq(staff.id, leadStageHistory.movedBy))
      .where(eq(leads.reference, reference))
      .orderBy(leadStageHistory.movedAt);

    return rows.map((row) => ({
      from: row.fromStage ? (fromDbEnum(row.fromStage) as LeadStage) : null,
      to: fromDbEnum(row.toStage) as LeadStage,
      at: row.movedAt.toISOString(),
      by: row.movedByName,
    }));
  });
}

/**
 * plan §7: "Lead conversion — one transaction: create patient, link lead,
 * write stage history, write two audit entries."
 *
 * Deliberately does **not** create the patient here. The contact details a
 * patient needs are encrypted on the lead, and copying them across would mean
 * decrypting inside a conversion — a disclosure with no reveal entry against
 * it. Instead the caller creates the patient through its own flow (which
 * takes plaintext from a form, encrypts it, and derives the fragments) and
 * passes the reference in. This function links them.
 *
 * plan §11 asks that conversion roll back entirely if any step fails; keeping
 * it to one transaction over two tables is what makes that true.
 */
export async function linkConverted(
  session: AuthzSession,
  reference: string,
  patientReference: string,
  context: AuditContext,
): Promise<LeadDTO> {
  assert(session, "pipeline", "edit");
  assert(session, "patients", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [lead] = await tx
        .select({ id: leads.id, stage: leads.stage, converted: leads.convertedPatientId })
        .from(leads)
        .where(eq(leads.reference, reference))
        .limit(1);
      if (!lead) throw new NotFoundError("That lead could not be found.", { reference });
      if (lead.converted) {
        throw new ConflictError("CONFLICT", "That lead has already been converted.", { reference });
      }

      const [patient] = await tx
        .select({ id: patients.id })
        .from(patients)
        .where(eq(patients.reference, patientReference))
        .limit(1);
      if (!patient) {
        throw new NotFoundError("That patient could not be found.", {
          reference: patientReference,
        });
      }

      const converted = toDbEnum("converted" as LeadStage);
      await tx
        .update(leads)
        .set({ convertedPatientId: patient.id, stage: converted, lastContactAt: new Date() })
        .where(eq(leads.id, lead.id));

      await tx.insert(leadStageHistory).values({
        leadId: lead.id,
        fromStage: lead.stage,
        toStage: converted,
        movedBy: session.staffId,
      });

      // Two entries, per plan §7: one against the lead, one against the
      // patient, so the link is findable from either side of it.
      await writeAudit(tx, session, context, {
        action: "updated",
        resourceType: "lead",
        resourceId: reference,
        field: "convertedPatientId",
        newValue: patientReference,
      });
      await writeAudit(tx, session, context, {
        action: "created",
        resourceType: "patient",
        resourceId: patientReference,
        field: "convertedFromLead",
        newValue: reference,
      });

      return byReferenceIn(tx, session, reference);
    }),
  );
}

/** The read used to return a fresh DTO after a write, inside the same transaction. */
async function byReferenceIn(
  tx: Parameters<Parameters<typeof withSession>[1]>[0],
  session: AuthzSession,
  reference: string,
): Promise<LeadDTO> {
  const [row] = await tx
    .select(projection)
    .from(leads)
    .leftJoin(departments, eq(departments.id, leads.departmentId))
    .leftJoin(staff, eq(staff.id, leads.ownerId))
    .leftJoin(patients, eq(patients.id, leads.convertedPatientId))
    .where(eq(leads.reference, reference))
    .limit(1);
  if (!row) throw new NotFoundError("That lead could not be found.", { reference });
  return toDTO(session, row as Record<string, unknown>);
}

/** Board counts per stage, for the pipeline column headers. */
export async function stageCounts(session: AuthzSession): Promise<Record<string, number>> {
  assert(session, "pipeline", "view");

  return withSession(session, async (tx) => {
    const rows = await tx
      .select({ stage: leads.stage, n: sql<number>`count(*)::int` })
      .from(leads)
      .where(isNull(leads.convertedPatientId))
      .groupBy(leads.stage);

    return Object.fromEntries(rows.map((row) => [fromDbEnum(row.stage), row.n]));
  });
}

/** Leads with a follow-up date already past. Drives the pipeline's overdue badge. */
export async function overdueCount(session: AuthzSession): Promise<number> {
  assert(session, "pipeline", "view");

  return withSession(session, async (tx) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(
        and(
          isNull(leads.convertedPatientId),
          isNotNull(leads.nextFollowUp),
          sql`${leads.nextFollowUp} < CURRENT_DATE`,
        ),
      );
    return row?.n ?? 0;
  });
}
