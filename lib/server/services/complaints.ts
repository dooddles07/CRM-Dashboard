import { and, asc, count, eq, sql } from "drizzle-orm";
import { assert, type AuthzSession } from "@/lib/server/authz/policy";
import { writeAudit, writeFieldUpdates, type AuditContext } from "@/lib/server/audit/write";
import { withSession } from "@/lib/server/db/session";
import { complaints } from "@/lib/server/db/schema/experience";
import { departments } from "@/lib/server/db/schema/org";
import { patients, staff } from "@/lib/server/db/schema/people";
import { fromDbEnum, toDbEnum } from "@/lib/server/db/enum-map";
import type { CaseStatus, Priority } from "@/lib/types";
import { NotFoundError, mappingDatabaseErrors } from "./errors";
import { paginate, resolvePage, type PageRequest, type Paginated } from "./pagination";

/**
 * plan/04-service-layer.md §9: "`status` and breach derived server-side, never
 * from a client clock."
 *
 * SLA breach is `sla_due_at < now()`, and the `now()` has to be the
 * database's. A browser clock can be wrong by hours, deliberately or
 * otherwise, and a complaint that shows as within-SLA on a laptop set to
 * yesterday is a complaint nobody escalates. So `breached` and `hoursToBreach`
 * are computed in SQL below and sent as facts, not as a due date the client is
 * trusted to compare against.
 *
 * The DTO still carries `slaDueAt` — a screen needs to render the deadline —
 * but nothing downstream should recompute breach from it.
 */

export interface ComplaintDTO {
  reference: string;
  patient: { reference: string; name: string };
  department: { id: string; name: string } | null;
  subject: string;
  description: string;
  type: string;
  owner: { reference: string; name: string } | null;
  priority: Priority;
  status: CaseStatus;
  openedAt: string;
  slaDueAt: string;
  /** Computed against the database clock. Do not recompute from `slaDueAt`. */
  breached: boolean;
  hoursToBreach: number | null;
  resolvedAt: string | null;
  resolution: string | null;
}

export interface ComplaintFilters extends PageRequest {
  status?: CaseStatus;
  priority?: Priority;
  departmentId?: string;
  ownerId?: string;
  /** Open cases past their SLA. The escalation queue. */
  breachedOnly?: boolean;
}

/** Open means not resolved and not closed — the states an SLA still runs against. */
const OPEN_STATES = sql`${complaints.status} IN ('new','assigned','investigating','waiting')`;

const projection = {
  reference: complaints.reference,
  subject: complaints.subject,
  description: complaints.description,
  type: complaints.type,
  priority: complaints.priority,
  status: complaints.status,
  openedAt: complaints.openedAt,
  slaDueAt: complaints.slaDueAt,
  resolvedAt: complaints.resolvedAt,
  resolution: complaints.resolution,
  patientReference: patients.reference,
  patientName: patients.name,
  departmentId: departments.id,
  departmentName: departments.name,
  ownerReference: staff.reference,
  ownerName: staff.name,
  breached: sql<boolean>`(${complaints.resolvedAt} IS NULL AND ${complaints.slaDueAt} < now())`.as(
    "breached",
  ),
  hoursToBreach: sql<number | null>`
    CASE WHEN ${complaints.resolvedAt} IS NOT NULL THEN NULL
         ELSE round(extract(epoch FROM (${complaints.slaDueAt} - now())) / 3600.0)::int
    END`.as("hours_to_breach"),
};

function toDTO(row: Record<string, unknown>): ComplaintDTO {
  return {
    reference: row.reference as string,
    patient: {
      reference: row.patientReference as string,
      name: row.patientName as string,
    },
    department:
      row.departmentId && row.departmentName
        ? { id: row.departmentId as string, name: row.departmentName as string }
        : null,
    subject: row.subject as string,
    description: row.description as string,
    type: row.type as string,
    owner:
      row.ownerReference && row.ownerName
        ? { reference: row.ownerReference as string, name: row.ownerName as string }
        : null,
    priority: fromDbEnum(row.priority as string) as Priority,
    status: fromDbEnum(row.status as string) as CaseStatus,
    openedAt: (row.openedAt as Date).toISOString(),
    slaDueAt: (row.slaDueAt as Date).toISOString(),
    breached: Boolean(row.breached),
    hoursToBreach: row.hoursToBreach === null ? null : Number(row.hoursToBreach),
    resolvedAt: (row.resolvedAt as Date | null)?.toISOString() ?? null,
    resolution: (row.resolution as string | null) ?? null,
  };
}

function joined(tx: Parameters<Parameters<typeof withSession>[1]>[0]) {
  return tx
    .select(projection)
    .from(complaints)
    .innerJoin(patients, eq(patients.id, complaints.patientId))
    .leftJoin(departments, eq(departments.id, complaints.departmentId))
    .leftJoin(staff, eq(staff.id, complaints.ownerId));
}

export async function list(
  session: AuthzSession,
  filters: ComplaintFilters = {},
): Promise<Paginated<ComplaintDTO>> {
  assert(session, "patients", "view");
  const { page, perPage, offset } = resolvePage(filters);

  return withSession(session, async (tx) => {
    const where = and(
      filters.status ? eq(complaints.status, toDbEnum(filters.status)) : undefined,
      filters.priority ? eq(complaints.priority, toDbEnum(filters.priority)) : undefined,
      filters.departmentId ? eq(complaints.departmentId, filters.departmentId) : undefined,
      filters.ownerId ? eq(complaints.ownerId, filters.ownerId) : undefined,
      filters.breachedOnly ? sql`${complaints.slaDueAt} < now() AND ${OPEN_STATES}` : undefined,
    );

    const rows = await joined(tx)
      .where(where)
      .orderBy(asc(complaints.slaDueAt))
      .limit(perPage)
      .offset(offset);

    const [totals] = await tx
      .select({ total: count() })
      .from(complaints)
      .innerJoin(patients, eq(patients.id, complaints.patientId))
      .where(where);

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
): Promise<ComplaintDTO> {
  assert(session, "patients", "view");

  return withSession(session, async (tx) => {
    const [row] = await joined(tx).where(eq(complaints.reference, reference)).limit(1);
    if (!row) throw new NotFoundError("That complaint could not be found.", { reference });
    return toDTO(row as Record<string, unknown>);
  });
}

export async function update(
  session: AuthzSession,
  reference: string,
  patch: { status?: CaseStatus; priority?: Priority; ownerId?: string | null },
  context: AuditContext,
): Promise<ComplaintDTO> {
  assert(session, "patients", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [before] = await tx
        .select({
          id: complaints.id,
          status: complaints.status,
          priority: complaints.priority,
          ownerId: complaints.ownerId,
        })
        .from(complaints)
        .where(eq(complaints.reference, reference))
        .limit(1);

      if (!before) throw new NotFoundError("That complaint could not be found.", { reference });

      const next = {
        ...(patch.status !== undefined ? { status: toDbEnum(patch.status) } : {}),
        ...(patch.priority !== undefined ? { priority: toDbEnum(patch.priority) } : {}),
        ...(patch.ownerId !== undefined ? { ownerId: patch.ownerId } : {}),
      };

      if (Object.keys(next).length > 0) {
        await tx.update(complaints).set(next).where(eq(complaints.id, before.id));
        await writeFieldUpdates(
          tx,
          session,
          context,
          { type: "complaint", id: reference },
          before,
          next,
        );
      }

      const [fresh] = await joined(tx).where(eq(complaints.id, before.id)).limit(1);
      return toDTO(fresh as Record<string, unknown>);
    }),
  );
}

/**
 * Resolving stamps `resolved_at` from the database clock, which is what stops
 * the SLA running. A caller-supplied timestamp would let a late resolution be
 * backdated to inside its window.
 */
export async function resolve(
  session: AuthzSession,
  reference: string,
  resolution: string,
  context: AuditContext,
): Promise<ComplaintDTO> {
  assert(session, "patients", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [before] = await tx
        .select({ id: complaints.id, resolvedAt: complaints.resolvedAt })
        .from(complaints)
        .where(eq(complaints.reference, reference))
        .limit(1);
      if (!before) throw new NotFoundError("That complaint could not be found.", { reference });

      if (!before.resolvedAt) {
        await tx
          .update(complaints)
          .set({
            resolvedAt: sql`now()`,
            resolution,
            status: toDbEnum("resolved" as CaseStatus),
          })
          .where(eq(complaints.id, before.id));

        await writeAudit(tx, session, context, {
          action: "updated",
          resourceType: "complaint",
          resourceId: reference,
          field: "resolvedAt",
          newValue: resolution,
        });
      }

      const [fresh] = await joined(tx).where(eq(complaints.id, before.id)).limit(1);
      return toDTO(fresh as Record<string, unknown>);
    }),
  );
}

/** Open, breached, and per-status counts for the complaints header. */
export async function summary(
  session: AuthzSession,
): Promise<{ open: number; breached: number; byStatus: Record<string, number> }> {
  assert(session, "patients", "view");

  return withSession(session, async (tx) => {
    const [totals] = await tx
      .select({
        open: sql<number>`count(*) FILTER (WHERE ${OPEN_STATES})::int`,
        breached: sql<number>`count(*) FILTER (WHERE ${OPEN_STATES} AND ${complaints.slaDueAt} < now())::int`,
      })
      .from(complaints);

    const rows = await tx
      .select({ status: complaints.status, n: sql<number>`count(*)::int` })
      .from(complaints)
      .groupBy(complaints.status);

    return {
      open: totals?.open ?? 0,
      breached: totals?.breached ?? 0,
      byStatus: Object.fromEntries(rows.map((row) => [fromDbEnum(row.status), row.n])),
    };
  });
}
