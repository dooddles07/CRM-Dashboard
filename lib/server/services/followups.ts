import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { assert, type AuthzSession } from "@/lib/server/authz/policy";
import { writeAudit, type AuditContext } from "@/lib/server/audit/write";
import { withSession } from "@/lib/server/db/session";
import { patients, staff } from "@/lib/server/db/schema/people";
import { followUps } from "@/lib/server/db/schema/work";
import { fromDbEnum } from "@/lib/server/db/enum-map";
import type { FollowUpStatus, Priority } from "@/lib/types";
import { NotFoundError, mappingDatabaseErrors } from "./errors";
import { paginate, resolvePage, type PageRequest, type Paginated } from "./pagination";

/**
 * plan/04-service-layer.md §9: "`status` reads from the derived view, never
 * stored."
 *
 * `follow_ups` has no status column. `follow_ups_with_status`
 * (drizzle/manual/0004_follow_ups_view.sql) derives it from `due_date` and
 * `completed_at` so it cannot go stale — a row that was "pending" yesterday
 * is "overdue" today without anything having written to it.
 *
 * That is why status is computed in SQL below rather than in TypeScript. The
 * view's CASE and a JavaScript equivalent would disagree the moment a request
 * crossed midnight in a different timezone from the database, and the view is
 * the one the plan named as authoritative. Drizzle has no first-class way to
 * track a view built on a CASE expression, so the expression is restated here
 * against the base table — and `scripts/policy-tests.ts` has the view itself
 * to compare against if they ever drift.
 */

export interface FollowUpDTO {
  reference: string;
  patient: { reference: string; name: string };
  type: string;
  owner: { reference: string; name: string } | null;
  dueDate: string;
  priority: Priority;
  status: FollowUpStatus;
  completedAt: string | null;
  note: string | null;
}

export interface FollowUpFilters extends PageRequest {
  status?: FollowUpStatus;
  ownerId?: string;
  patientReference?: string;
}

/** The view's CASE, restated. See the module comment for why it lives here. */
const derivedStatus = sql<string>`
  CASE WHEN ${followUps.completedAt} IS NOT NULL THEN 'completed'
       WHEN ${followUps.dueDate} < CURRENT_DATE  THEN 'overdue'
       WHEN ${followUps.dueDate} = CURRENT_DATE  THEN 'pending'
       ELSE 'scheduled' END`;

const projection = {
  reference: followUps.reference,
  type: followUps.type,
  dueDate: followUps.dueDate,
  priority: followUps.priority,
  completedAt: followUps.completedAt,
  note: followUps.note,
  status: derivedStatus.as("derived_status"),
  patientReference: patients.reference,
  patientName: patients.name,
  ownerReference: staff.reference,
  ownerName: staff.name,
};

function toDTO(row: Record<string, unknown>): FollowUpDTO {
  return {
    reference: row.reference as string,
    patient: {
      reference: row.patientReference as string,
      name: row.patientName as string,
    },
    type: row.type as string,
    owner:
      row.ownerReference && row.ownerName
        ? { reference: row.ownerReference as string, name: row.ownerName as string }
        : null,
    dueDate: row.dueDate as string,
    priority: fromDbEnum(row.priority as string) as Priority,
    status: row.status as FollowUpStatus,
    completedAt: (row.completedAt as Date | null)?.toISOString() ?? null,
    note: (row.note as string | null) ?? null,
  };
}

export async function list(
  session: AuthzSession,
  filters: FollowUpFilters = {},
): Promise<Paginated<FollowUpDTO>> {
  assert(session, "pipeline", "view");
  const { page, perPage, offset } = resolvePage(filters);

  return withSession(session, async (tx) => {
    const where = and(
      filters.ownerId ? eq(followUps.ownerId, filters.ownerId) : undefined,
      filters.patientReference ? eq(patients.reference, filters.patientReference) : undefined,
      // Compared against the derived expression, not a stored column.
      filters.status ? sql`${derivedStatus} = ${filters.status}` : undefined,
    );

    const rows = await tx
      .select(projection)
      .from(followUps)
      .innerJoin(patients, eq(patients.id, followUps.patientId))
      .leftJoin(staff, eq(staff.id, followUps.ownerId))
      .where(where)
      .orderBy(asc(followUps.dueDate))
      .limit(perPage)
      .offset(offset);

    const [totals] = await tx
      .select({ total: count() })
      .from(followUps)
      .innerJoin(patients, eq(patients.id, followUps.patientId))
      .where(where);

    return paginate(
      rows.map((row) => toDTO(row as Record<string, unknown>)),
      totals?.total ?? 0,
      page,
      perPage,
    );
  });
}

/**
 * Completing is idempotent: a second call is a no-op rather than a second
 * audit entry. Two people clicking the same row should not read as two events.
 */
export async function complete(
  session: AuthzSession,
  reference: string,
  note: string | null,
  context: AuditContext,
): Promise<FollowUpDTO> {
  assert(session, "pipeline", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [row] = await tx
        .select({ id: followUps.id, completedAt: followUps.completedAt })
        .from(followUps)
        .where(eq(followUps.reference, reference))
        .limit(1);

      if (!row) throw new NotFoundError("That follow-up could not be found.", { reference });

      if (!row.completedAt) {
        await tx
          .update(followUps)
          .set({ completedAt: new Date(), note, updatedAt: new Date() })
          .where(eq(followUps.id, row.id));

        await writeAudit(tx, session, context, {
          action: "updated",
          resourceType: "follow_up",
          resourceId: reference,
          field: "completedAt",
          newValue: note ?? "completed",
        });
      }

      const [fresh] = await tx
        .select(projection)
        .from(followUps)
        .innerJoin(patients, eq(patients.id, followUps.patientId))
        .leftJoin(staff, eq(staff.id, followUps.ownerId))
        .where(eq(followUps.id, row.id))
        .limit(1);

      return toDTO(fresh as Record<string, unknown>);
    }),
  );
}

/**
 * Reschedule moves the due date only. It does not touch `completedAt` — a
 * completed follow-up is history, not something a due-date edit should be
 * able to reopen.
 */
export async function reschedule(
  session: AuthzSession,
  reference: string,
  dueDate: string,
  context: AuditContext,
): Promise<FollowUpDTO> {
  assert(session, "pipeline", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [row] = await tx
        .select({ id: followUps.id, dueDate: followUps.dueDate })
        .from(followUps)
        .where(eq(followUps.reference, reference))
        .limit(1);

      if (!row) throw new NotFoundError("That follow-up could not be found.", { reference });

      await tx
        .update(followUps)
        .set({ dueDate, updatedAt: new Date() })
        .where(eq(followUps.id, row.id));

      await writeAudit(tx, session, context, {
        action: "updated",
        resourceType: "follow_up",
        resourceId: reference,
        field: "dueDate",
        previousValue: row.dueDate,
        newValue: dueDate,
      });

      const [fresh] = await tx
        .select(projection)
        .from(followUps)
        .innerJoin(patients, eq(patients.id, followUps.patientId))
        .leftJoin(staff, eq(staff.id, followUps.ownerId))
        .where(eq(followUps.id, row.id))
        .limit(1);

      return toDTO(fresh as Record<string, unknown>);
    }),
  );
}

/** Counts per derived status, for the rail badge and the follow-ups header. */
export async function statusCounts(session: AuthzSession): Promise<Record<string, number>> {
  assert(session, "pipeline", "view");

  return withSession(session, async (tx) => {
    const rows = await tx
      .select({ status: derivedStatus.as("s"), n: sql<number>`count(*)::int` })
      .from(followUps)
      .groupBy(derivedStatus);

    return Object.fromEntries(rows.map((row) => [row.status, row.n]));
  });
}

/** Open follow-ups owned by the caller. The dashboard's "your work" panel. */
export async function mine(session: AuthzSession, limit = 10): Promise<FollowUpDTO[]> {
  assert(session, "pipeline", "view");

  return withSession(session, async (tx) => {
    const rows = await tx
      .select(projection)
      .from(followUps)
      .innerJoin(patients, eq(patients.id, followUps.patientId))
      .leftJoin(staff, eq(staff.id, followUps.ownerId))
      .where(and(eq(followUps.ownerId, session.staffId), isNull(followUps.completedAt)))
      .orderBy(asc(followUps.dueDate))
      .limit(Math.min(50, Math.max(1, limit)));

    return rows.map((row) => toDTO(row as Record<string, unknown>));
  });
}
