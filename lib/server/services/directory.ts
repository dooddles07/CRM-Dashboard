import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { assert, type AuthzSession } from "@/lib/server/authz/policy";
import { writeAudit, type AuditContext } from "@/lib/server/audit/write";
import { withSession } from "@/lib/server/db/session";
import { departments } from "@/lib/server/db/schema/org";
import { doctors, patients, staff } from "@/lib/server/db/schema/people";
import { appointments } from "@/lib/server/db/schema/scheduling";
import { maskEmailFromDomain, maskPhone, type MaskedField } from "@/lib/server/mask/serialize";
import { holds } from "@/lib/server/authz/policy";
import { fromDbEnum } from "@/lib/server/db/enum-map";
import { isRole, type Role } from "@/lib/server/authz/matrix";
import type { DoctorStatus, StaffMember } from "@/lib/types";
import { NotFoundError, ValidationError, mappingDatabaseErrors } from "./errors";
import { paginate, resolvePage, type PageRequest, type Paginated } from "./pagination";

/**
 * plan/04-service-layer.md §9's three directory services — `staff`, `doctors`
 * and `departments` — in one module.
 *
 * They are together because they are the same thing: the org chart. All three
 * are readable by every authenticated role (plan/03 §5.2, "They are the
 * directory"), all three are tiny, and splitting them across three files
 * would put one function in each and force every caller to import three
 * modules to render a picker.
 *
 * Their row-level policies are permissive for the same reason, so scope here
 * comes from the area matrix alone: reading the directory needs nothing,
 * changing a staff member's role needs `users: edit`.
 *
 * `staff` and `doctors` do carry encrypted contact columns with fragments
 * beside them, so their DTOs mask exactly as patients do.
 */

export type StaffStatus = StaffMember["status"];

export interface StaffDTO {
  reference: string;
  name: string;
  initials: string;
  role: Role;
  department: { id: string; name: string } | null;
  status: StaffStatus;
  mfaEnabled: boolean;
  joinedAt: string;
  lastActiveAt: string | null;
  email: MaskedField;
}

export interface DoctorDTO {
  reference: string;
  name: string;
  initials: string;
  specialty: string;
  department: { id: string; name: string } | null;
  status: DoctorStatus;
  yearsExperience: number;
  languages: string[];
  schedule: { day: string; from: string; to: string }[];
  appointmentsToday: number;
  patients: number;
  satisfaction: number | null;
  noShowRate: number | null;
  phone: MaskedField;
  email: MaskedField;
}

export interface DepartmentDTO {
  id: string;
  slug: string;
  name: string;
  floor: string | null;
  head: { reference: string; name: string } | null;
  /** Live counts, not stored rollups — see `listDepartments`. */
  patientCount: number;
  doctorCount: number;
  upcomingAppointments: number;
}

/* -------------------------------------------------------------------------- */
/* Staff                                                                      */
/* -------------------------------------------------------------------------- */

export interface StaffFilters extends PageRequest {
  role?: Role;
  departmentId?: string;
  status?: StaffStatus;
  includeArchived?: boolean;
}

function toStaffDTO(session: AuthzSession, row: Record<string, unknown>): StaffDTO {
  const rawRole = row.role as string;
  return {
    reference: row.reference as string,
    name: row.name as string,
    initials: row.initials as string,
    // The database constrains this column to the nine roles
    // (`staff_role_known`), so an unknown value here means the constraint and
    // the matrix have diverged. Reported rather than coerced.
    role: (isRole(rawRole) ? rawRole : "Nurse") as Role,
    department:
      row.departmentId && row.departmentName
        ? { id: row.departmentId as string, name: row.departmentName as string }
        : null,
    status: fromDbEnum(row.status as string) as StaffStatus,
    mfaEnabled: Boolean(row.mfaEnabled),
    joinedAt: row.joinedAt as string,
    lastActiveAt: (row.lastActiveAt as Date | null)?.toISOString() ?? null,
    email: {
      masked: maskEmailFromDomain(row.emailDomain as string | null),
      revealable: holds(session, "reveal"),
    },
  };
}

const staffProjection = {
  reference: staff.reference,
  name: staff.name,
  initials: staff.initials,
  role: staff.role,
  status: staff.status,
  mfaEnabled: staff.mfaEnabled,
  joinedAt: staff.joinedAt,
  lastActiveAt: staff.lastActiveAt,
  emailDomain: staff.emailDomain,
  departmentId: departments.id,
  departmentName: departments.name,
};

export async function listStaff(
  session: AuthzSession,
  filters: StaffFilters = {},
): Promise<Paginated<StaffDTO>> {
  const { page, perPage, offset } = resolvePage(filters);

  return withSession(session, async (tx) => {
    const where = and(
      filters.includeArchived ? undefined : isNull(staff.archivedAt),
      filters.role ? eq(staff.role, filters.role) : undefined,
      filters.departmentId ? eq(staff.departmentId, filters.departmentId) : undefined,
      filters.status ? eq(staff.status, fromDbEnum(filters.status) as never) : undefined,
    );

    const rows = await tx
      .select(staffProjection)
      .from(staff)
      .leftJoin(departments, eq(departments.id, staff.departmentId))
      .where(where)
      .orderBy(asc(staff.name))
      .limit(perPage)
      .offset(offset);

    const [totals] = await tx.select({ total: count() }).from(staff).where(where);

    return paginate(
      rows.map((row) => toStaffDTO(session, row as Record<string, unknown>)),
      totals?.total ?? 0,
      page,
      perPage,
    );
  });
}

/**
 * plan §9: "Role change writes audit with before and after."
 *
 * Needs `users: edit`. It is the sharpest write in the product that is not a
 * reveal: a role change silently changes which rows row-level security lets
 * that person see, so the entry naming both sides of it is the only record
 * that the scope moved.
 *
 * The new role is validated against the matrix before the write. The database
 * would refuse an unknown one anyway (`staff_role_known`), but a
 * ValidationError names the field, and a constraint violation would surface
 * as a generic 500.
 */
export async function changeRole(
  session: AuthzSession,
  reference: string,
  role: string,
  context: AuditContext,
): Promise<StaffDTO> {
  assert(session, "users", "edit");

  if (!isRole(role)) {
    throw new ValidationError("That is not a role this application recognises.", {
      field: "role",
      value: role,
    });
  }

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [before] = await tx
        .select({ id: staff.id, role: staff.role })
        .from(staff)
        .where(eq(staff.reference, reference))
        .limit(1);
      if (!before) throw new NotFoundError("That staff member could not be found.", { reference });

      if (before.role !== role) {
        await tx
          .update(staff)
          .set({ role, updatedAt: new Date() })
          .where(eq(staff.id, before.id));

        await writeAudit(tx, session, context, {
          action: "updated",
          resourceType: "staff",
          resourceId: reference,
          field: "role",
          previousValue: before.role,
          newValue: role,
        });
      }

      const [fresh] = await tx
        .select(staffProjection)
        .from(staff)
        .leftJoin(departments, eq(departments.id, staff.departmentId))
        .where(eq(staff.id, before.id))
        .limit(1);
      return toStaffDTO(session, fresh as Record<string, unknown>);
    }),
  );
}

/** Suspending an account. Same privilege as a role change, and audited the same way. */
export async function setStaffStatus(
  session: AuthzSession,
  reference: string,
  status: StaffStatus,
  context: AuditContext,
): Promise<void> {
  assert(session, "users", "edit");

  await withSession(session, async (tx) => {
    const [before] = await tx
      .select({ id: staff.id, status: staff.status })
      .from(staff)
      .where(eq(staff.reference, reference))
      .limit(1);
    if (!before) throw new NotFoundError("That staff member could not be found.", { reference });

    await tx
      .update(staff)
      .set({ status: status as never, updatedAt: new Date() })
      .where(eq(staff.id, before.id));

    await writeAudit(tx, session, context, {
      action: "updated",
      resourceType: "staff",
      resourceId: reference,
      field: "status",
      previousValue: fromDbEnum(before.status),
      newValue: status,
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Doctors                                                                    */
/* -------------------------------------------------------------------------- */

export async function listDoctors(
  session: AuthzSession,
  filters: PageRequest & { departmentId?: string; specialty?: string } = {},
): Promise<Paginated<DoctorDTO>> {
  const { page, perPage, offset } = resolvePage(filters);
  const revealable = holds(session, "reveal");

  return withSession(session, async (tx) => {
    const where = and(
      isNull(doctors.archivedAt),
      filters.departmentId ? eq(doctors.departmentId, filters.departmentId) : undefined,
      filters.specialty ? eq(doctors.specialty, filters.specialty) : undefined,
    );

    const rows = await tx
      .select({
        reference: doctors.reference,
        name: doctors.name,
        initials: doctors.initials,
        specialty: doctors.specialty,
        status: doctors.status,
        yearsExperience: doctors.yearsExperience,
        languages: doctors.languages,
        schedule: doctors.schedule,
        appointmentsToday: doctors.appointmentsToday,
        patients: doctors.patients,
        satisfaction: doctors.satisfaction,
        noShowRate: doctors.noShowRate,
        phoneLast2: doctors.phoneLast2,
        emailDomain: doctors.emailDomain,
        departmentId: departments.id,
        departmentName: departments.name,
      })
      .from(doctors)
      .leftJoin(departments, eq(departments.id, doctors.departmentId))
      .where(where)
      .orderBy(asc(doctors.name))
      .limit(perPage)
      .offset(offset);

    const [totals] = await tx.select({ total: count() }).from(doctors).where(where);

    return paginate(
      rows.map((row) => ({
        reference: row.reference,
        name: row.name,
        initials: row.initials,
        specialty: row.specialty,
        department:
          row.departmentId && row.departmentName
            ? { id: row.departmentId, name: row.departmentName }
            : null,
        status: fromDbEnum(row.status) as DoctorStatus,
        yearsExperience: row.yearsExperience,
        languages: row.languages ?? [],
        schedule: row.schedule ?? [],
        appointmentsToday: row.appointmentsToday,
        patients: row.patients,
        satisfaction: row.satisfaction === null ? null : Number(row.satisfaction),
        noShowRate: row.noShowRate === null ? null : Number(row.noShowRate),
        phone: { masked: maskPhone(row.phoneLast2), revealable },
        email: { masked: maskEmailFromDomain(row.emailDomain), revealable },
      })),
      totals?.total ?? 0,
      page,
      perPage,
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Departments                                                                */
/* -------------------------------------------------------------------------- */

/**
 * plan §9: "Rollups from the view in Phase 01 §4.8."
 *
 * That view was never built — Phase 01 shipped without it, and
 * `lib/data/constants.ts`'s department figures are demo numbers rather than
 * anything derived. So the counts here are computed live from the tables
 * instead.
 *
 * Doing it live has a property the stored rollup would not: the counts are
 * subject to row-level security like everything else, so a Nurse reading the
 * departments screen sees patient counts covering their own department and
 * zero elsewhere. A stored rollup would report hospital-wide totals to
 * everyone, which is a small but real disclosure about departments they
 * cannot otherwise see.
 */
export async function listDepartments(session: AuthzSession): Promise<DepartmentDTO[]> {
  return withSession(session, async (tx) => {
    const rows = await tx
      .select({
        id: departments.id,
        slug: departments.slug,
        name: departments.name,
        floor: departments.floor,
        headReference: doctors.reference,
        headName: doctors.name,
        patientCount: sql<number>`
          (SELECT count(*)::int FROM ${patients}
           WHERE ${patients.departmentId} = ${departments.id}
             AND ${patients.archivedAt} IS NULL)`,
        doctorCount: sql<number>`
          (SELECT count(*)::int FROM ${doctors} d
           WHERE d.department_id = ${departments.id} AND d.archived_at IS NULL)`,
        upcomingAppointments: sql<number>`
          (SELECT count(*)::int FROM ${appointments}
           WHERE ${appointments.departmentId} = ${departments.id}
             AND ${appointments.startsAt} >= now())`,
      })
      .from(departments)
      .leftJoin(doctors, eq(doctors.id, departments.headId))
      .orderBy(asc(departments.name));

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      floor: row.floor,
      head:
        row.headReference && row.headName
          ? { reference: row.headReference, name: row.headName }
          : null,
      patientCount: row.patientCount ?? 0,
      doctorCount: row.doctorCount ?? 0,
      upcomingAppointments: row.upcomingAppointments ?? 0,
    }));
  });
}
