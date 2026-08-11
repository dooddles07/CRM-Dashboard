import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { assert, type AuthzSession } from "@/lib/server/authz/policy";
import { writeAudit, writeFieldUpdates, type AuditContext } from "@/lib/server/audit/write";
import { withSession } from "@/lib/server/db/session";
import { departments } from "@/lib/server/db/schema/org";
import { patients, staff } from "@/lib/server/db/schema/people";
import { referrals } from "@/lib/server/db/schema/pipeline";
import { fromDbEnum, toDbEnum } from "@/lib/server/db/enum-map";
import type { ReferralStatus } from "@/lib/types";
import { NotFoundError, mappingDatabaseErrors } from "./errors";
import { paginate, resolvePage, type PageRequest, type Paginated } from "./pagination";

/**
 * plan/04-service-layer.md §9: "Handles the unresolved-name case from Phase 01
 * §6.2."
 *
 * A referral arrives before the patient record exists, so `patient_id` is
 * nullable and `patient_name_raw` is kept permanently rather than as a
 * migration artefact — an unmatched referral is a real ongoing state, not a
 * data-quality defect to be cleaned up.
 *
 * The DTO therefore reports a patient two ways: `patient` when the referral
 * has been resolved to a record, and `patientNameRaw` always. A screen shows
 * the link when there is one and the raw name when there is not, and
 * `resolved` says which without the caller inferring it from a null.
 *
 * Row scope comes from `referrals.department_id`, not from the patient — the
 * patient may not exist yet. A referral with no department is invisible to
 * Manager, Doctor and Nurse; see drizzle/manual/0007's note on why that is
 * strict rather than permissive.
 */

export interface ReferralDTO {
  reference: string;
  patient: { reference: string; name: string } | null;
  patientNameRaw: string;
  resolved: boolean;
  provider: string;
  providerType: string;
  department: { id: string; name: string } | null;
  receivedAt: string;
  status: ReferralStatus;
  owner: { reference: string; name: string } | null;
  outcome: string | null;
  valueCents: number;
}

export interface ReferralFilters extends PageRequest {
  status?: ReferralStatus;
  departmentId?: string;
  providerType?: string;
  /** Referrals still waiting to be matched to a patient record. */
  unresolvedOnly?: boolean;
}

export interface ReferralPatch {
  status?: ReferralStatus;
  ownerId?: string | null;
  outcome?: string | null;
  departmentId?: string | null;
  valueCents?: number;
}

const projection = {
  reference: referrals.reference,
  patientNameRaw: referrals.patientNameRaw,
  provider: referrals.provider,
  providerType: referrals.providerType,
  receivedAt: referrals.receivedAt,
  status: referrals.status,
  outcome: referrals.outcome,
  valueCents: referrals.valueCents,
  patientReference: patients.reference,
  patientName: patients.name,
  departmentId: departments.id,
  departmentName: departments.name,
  ownerReference: staff.reference,
  ownerName: staff.name,
};

function toDTO(row: Record<string, unknown>): ReferralDTO {
  const resolved = Boolean(row.patientReference);
  return {
    reference: row.reference as string,
    patient: resolved
      ? { reference: row.patientReference as string, name: row.patientName as string }
      : null,
    patientNameRaw: row.patientNameRaw as string,
    resolved,
    provider: row.provider as string,
    providerType: row.providerType as string,
    department:
      row.departmentId && row.departmentName
        ? { id: row.departmentId as string, name: row.departmentName as string }
        : null,
    receivedAt: (row.receivedAt as Date).toISOString(),
    status: fromDbEnum(row.status as string) as ReferralStatus,
    owner:
      row.ownerReference && row.ownerName
        ? { reference: row.ownerReference as string, name: row.ownerName as string }
        : null,
    outcome: (row.outcome as string | null) ?? null,
    valueCents: Number(row.valueCents ?? 0),
  };
}

function joined(tx: Parameters<Parameters<typeof withSession>[1]>[0]) {
  return tx
    .select(projection)
    .from(referrals)
    .leftJoin(patients, eq(patients.id, referrals.patientId))
    .leftJoin(departments, eq(departments.id, referrals.departmentId))
    .leftJoin(staff, eq(staff.id, referrals.ownerId));
}

export async function list(
  session: AuthzSession,
  filters: ReferralFilters = {},
): Promise<Paginated<ReferralDTO>> {
  assert(session, "pipeline", "view");
  const { page, perPage, offset } = resolvePage(filters);

  return withSession(session, async (tx) => {
    const where = and(
      filters.status ? eq(referrals.status, toDbEnum(filters.status)) : undefined,
      filters.departmentId ? eq(referrals.departmentId, filters.departmentId) : undefined,
      filters.providerType ? eq(referrals.providerType, filters.providerType) : undefined,
      filters.unresolvedOnly ? isNull(referrals.patientId) : undefined,
    );

    const rows = await joined(tx)
      .where(where)
      .orderBy(desc(referrals.receivedAt))
      .limit(perPage)
      .offset(offset);

    const [totals] = await tx.select({ total: count() }).from(referrals).where(where);

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
): Promise<ReferralDTO> {
  assert(session, "pipeline", "view");

  return withSession(session, async (tx) => {
    const [row] = await joined(tx).where(eq(referrals.reference, reference)).limit(1);
    if (!row) throw new NotFoundError("That referral could not be found.", { reference });
    return toDTO(row as Record<string, unknown>);
  });
}

export async function update(
  session: AuthzSession,
  reference: string,
  patch: ReferralPatch,
  context: AuditContext,
): Promise<ReferralDTO> {
  assert(session, "pipeline", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [before] = await tx
        .select({
          id: referrals.id,
          status: referrals.status,
          ownerId: referrals.ownerId,
          outcome: referrals.outcome,
          departmentId: referrals.departmentId,
          valueCents: referrals.valueCents,
        })
        .from(referrals)
        .where(eq(referrals.reference, reference))
        .limit(1);

      if (!before) throw new NotFoundError("That referral could not be found.", { reference });

      const next = {
        ...(patch.status !== undefined ? { status: toDbEnum(patch.status) } : {}),
        ...(patch.ownerId !== undefined ? { ownerId: patch.ownerId } : {}),
        ...(patch.outcome !== undefined ? { outcome: patch.outcome } : {}),
        ...(patch.departmentId !== undefined ? { departmentId: patch.departmentId } : {}),
        ...(patch.valueCents !== undefined ? { valueCents: patch.valueCents } : {}),
      };

      if (Object.keys(next).length > 0) {
        await tx
          .update(referrals)
          .set({ ...next, updatedAt: new Date() })
          .where(eq(referrals.id, before.id));
        await writeFieldUpdates(
          tx,
          session,
          context,
          { type: "referral", id: reference },
          before,
          next,
        );
      }

      const [fresh] = await joined(tx).where(eq(referrals.id, before.id)).limit(1);
      return toDTO(fresh as Record<string, unknown>);
    }),
  );
}

/**
 * Matches an unresolved referral to a patient record.
 *
 * Separate from `update` because it is the operation the unresolved-name case
 * exists for, and because it needs `patients: view` as well — linking a
 * referral to a patient asserts a fact about that patient, and a caller who
 * cannot see the patient has no business asserting it.
 */
export async function resolveToPatient(
  session: AuthzSession,
  reference: string,
  patientReference: string,
  context: AuditContext,
): Promise<ReferralDTO> {
  assert(session, "pipeline", "edit");
  assert(session, "patients", "view");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [referral] = await tx
        .select({ id: referrals.id, patientId: referrals.patientId })
        .from(referrals)
        .where(eq(referrals.reference, reference))
        .limit(1);
      if (!referral) throw new NotFoundError("That referral could not be found.", { reference });

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

      await tx
        .update(referrals)
        .set({ patientId: patient.id, updatedAt: new Date() })
        .where(eq(referrals.id, referral.id));

      await writeAudit(tx, session, context, {
        action: "updated",
        resourceType: "referral",
        resourceId: reference,
        field: "patientId",
        newValue: patientReference,
      });

      const [fresh] = await joined(tx).where(eq(referrals.id, referral.id)).limit(1);
      return toDTO(fresh as Record<string, unknown>);
    }),
  );
}

export async function statusCounts(session: AuthzSession): Promise<Record<string, number>> {
  assert(session, "pipeline", "view");

  return withSession(session, async (tx) => {
    const rows = await tx
      .select({ status: referrals.status, n: sql<number>`count(*)::int` })
      .from(referrals)
      .groupBy(referrals.status);
    return Object.fromEntries(rows.map((row) => [fromDbEnum(row.status), row.n]));
  });
}
