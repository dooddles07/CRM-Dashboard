import { and, avg, count, desc, eq, sql } from "drizzle-orm";
import { assert, type AuthzSession } from "@/lib/server/authz/policy";
import { writeAudit, type AuditContext } from "@/lib/server/audit/write";
import { withSession } from "@/lib/server/db/session";
import { feedback } from "@/lib/server/db/schema/experience";
import { departments } from "@/lib/server/db/schema/org";
import { doctors, patients } from "@/lib/server/db/schema/people";
import { fromDbEnum, toDbEnum } from "@/lib/server/db/enum-map";
import type { Feedback } from "@/lib/types";

import { NotFoundError, mappingDatabaseErrors } from "./errors";
import { paginate, resolvePage, type PageRequest, type Paginated } from "./pagination";

/** Inline on the Feedback interface rather than a standalone union, so derived rather than retyped. */
export type FeedbackStatus = Feedback["status"];

/** plan/04-service-layer.md §9: "List, review, action." */

export interface FeedbackDTO {
  reference: string;
  patient: { reference: string; name: string };
  department: { id: string; name: string } | null;
  doctor: { reference: string; name: string } | null;
  rating: number;
  category: string;
  comment: string | null;
  status: FeedbackStatus;
  submittedAt: string;
}

export interface FeedbackFilters extends PageRequest {
  status?: FeedbackStatus;
  departmentId?: string;
  doctorId?: string;
  category?: string;
  /** Ratings at or below this. The detractor queue. */
  maxRating?: number;
}

const projection = {
  reference: feedback.reference,
  rating: feedback.rating,
  category: feedback.category,
  comment: feedback.comment,
  status: feedback.status,
  submittedAt: feedback.submittedAt,
  patientReference: patients.reference,
  patientName: patients.name,
  departmentId: departments.id,
  departmentName: departments.name,
  doctorReference: doctors.reference,
  doctorName: doctors.name,
};

function toDTO(row: Record<string, unknown>): FeedbackDTO {
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
    doctor:
      row.doctorReference && row.doctorName
        ? { reference: row.doctorReference as string, name: row.doctorName as string }
        : null,
    rating: Number(row.rating),
    category: row.category as string,
    comment: (row.comment as string | null) ?? null,
    status: fromDbEnum(row.status as string) as FeedbackStatus,
    submittedAt: (row.submittedAt as Date).toISOString(),
  };
}

function joined(tx: Parameters<Parameters<typeof withSession>[1]>[0]) {
  return tx
    .select(projection)
    .from(feedback)
    .innerJoin(patients, eq(patients.id, feedback.patientId))
    .leftJoin(departments, eq(departments.id, feedback.departmentId))
    .leftJoin(doctors, eq(doctors.id, feedback.doctorId));
}

export async function list(
  session: AuthzSession,
  filters: FeedbackFilters = {},
): Promise<Paginated<FeedbackDTO>> {
  assert(session, "patients", "view");
  const { page, perPage, offset } = resolvePage(filters);

  return withSession(session, async (tx) => {
    const where = and(
      filters.status ? eq(feedback.status, toDbEnum(filters.status)) : undefined,
      filters.departmentId ? eq(feedback.departmentId, filters.departmentId) : undefined,
      filters.doctorId ? eq(feedback.doctorId, filters.doctorId) : undefined,
      filters.category ? eq(feedback.category, filters.category) : undefined,
      filters.maxRating !== undefined ? sql`${feedback.rating} <= ${filters.maxRating}` : undefined,
    );

    const rows = await joined(tx)
      .where(where)
      .orderBy(desc(feedback.submittedAt))
      .limit(perPage)
      .offset(offset);

    const [totals] = await tx
      .select({ total: count() })
      .from(feedback)
      .innerJoin(patients, eq(patients.id, feedback.patientId))
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
 * Marking feedback reviewed or actioned. Writes an audit entry because it is
 * a claim that a human looked at a patient's complaint about their care, and
 * "who said they had dealt with this" is exactly the question asked later.
 */
export async function setStatus(
  session: AuthzSession,
  reference: string,
  status: FeedbackStatus,
  context: AuditContext,
): Promise<FeedbackDTO> {
  assert(session, "patients", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [before] = await tx
        .select({ id: feedback.id, status: feedback.status })
        .from(feedback)
        .where(eq(feedback.reference, reference))
        .limit(1);

      if (!before) throw new NotFoundError("That feedback could not be found.", { reference });

      const target = toDbEnum(status);
      if (before.status !== target) {
        await tx.update(feedback).set({ status: target }).where(eq(feedback.id, before.id));
        await writeAudit(tx, session, context, {
          action: "updated",
          resourceType: "feedback",
          resourceId: reference,
          field: "status",
          previousValue: fromDbEnum(before.status),
          newValue: status,
        });
      }

      const [fresh] = await joined(tx).where(eq(feedback.id, before.id)).limit(1);
      return toDTO(fresh as Record<string, unknown>);
    }),
  );
}

/**
 * Average rating and distribution.
 *
 * Scoped like everything else — a Nurse's average covers their department's
 * patients only, because RLS filters the rows before the aggregate sees them.
 * That is worth knowing when reading the number: it is "satisfaction among
 * the patients you can see", not a hospital-wide figure, unless the caller
 * sees every department.
 */
export async function ratingSummary(
  session: AuthzSession,
  filters: { departmentId?: string; doctorId?: string } = {},
): Promise<{ average: number | null; total: number; distribution: Record<number, number> }> {
  assert(session, "patients", "view");

  return withSession(session, async (tx) => {
    const where = and(
      filters.departmentId ? eq(feedback.departmentId, filters.departmentId) : undefined,
      filters.doctorId ? eq(feedback.doctorId, filters.doctorId) : undefined,
    );

    const [totals] = await tx
      .select({ average: avg(feedback.rating), total: count() })
      .from(feedback)
      .where(where);

    const rows = await tx
      .select({ rating: feedback.rating, n: sql<number>`count(*)::int` })
      .from(feedback)
      .where(where)
      .groupBy(feedback.rating);

    return {
      average: totals?.average === null ? null : Number(totals?.average ?? 0),
      total: totals?.total ?? 0,
      distribution: Object.fromEntries(rows.map((row) => [Number(row.rating), row.n])),
    };
  });
}
