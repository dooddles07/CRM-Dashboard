import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { assert, type AuthzSession } from "@/lib/server/authz/policy";
import { writeAudit, writeFieldUpdates, type AuditContext } from "@/lib/server/audit/write";
import { withSession } from "@/lib/server/db/session";
import { patients, staff } from "@/lib/server/db/schema/people";
import { tasks } from "@/lib/server/db/schema/work";
import { fromDbEnum, toDbEnum } from "@/lib/server/db/enum-map";
import type { Priority, TaskStatus } from "@/lib/types";
import { NotFoundError, mappingDatabaseErrors } from "./errors";
import { paginate, resolvePage, type PageRequest, type Paginated } from "./pagination";

/**
 * plan/04-service-layer.md §9. Straight CRUD, with one wrinkle worth naming.
 *
 * `tasks.patient_id` is nullable — a task need not be about anyone. The RLS
 * policy in drizzle/manual/0007 reads `patient_id IS NULL OR
 * app_sees_patient(patient_id)`, so an unattached task is visible to every
 * role that holds `pipeline: view`, while one attached to a patient inherits
 * that patient's department scope.
 *
 * That asymmetry is deliberate and documented in the migration: a task with
 * no patient carries no patient data, so department scope has nothing to say
 * about it. An unrouted *lead*, by contrast, stays hidden, because it does
 * carry contact details.
 */

export interface TaskDTO {
  reference: string;
  title: string;
  patient: { reference: string; name: string } | null;
  category: string;
  owner: { reference: string; name: string };
  priority: Priority;
  dueDate: string;
  status: TaskStatus;
  completedAt: string | null;
}

export interface TaskFilters extends PageRequest {
  status?: TaskStatus;
  ownerId?: string;
  category?: string;
  patientReference?: string;
  /** Hides `done` rows, which is what the task board wants by default. */
  openOnly?: boolean;
}

export interface NewTask {
  title: string;
  category: string;
  ownerId: string;
  dueDate: string;
  priority?: Priority;
  patientReference?: string | null;
}

export interface TaskPatch {
  title?: string;
  category?: string;
  ownerId?: string;
  dueDate?: string;
  priority?: Priority;
  status?: TaskStatus;
}

const projection = {
  reference: tasks.reference,
  title: tasks.title,
  category: tasks.category,
  priority: tasks.priority,
  dueDate: tasks.dueDate,
  status: tasks.status,
  completedAt: tasks.completedAt,
  patientReference: patients.reference,
  patientName: patients.name,
  ownerReference: staff.reference,
  ownerName: staff.name,
};

function toDTO(row: Record<string, unknown>): TaskDTO {
  return {
    reference: row.reference as string,
    title: row.title as string,
    patient:
      row.patientReference && row.patientName
        ? { reference: row.patientReference as string, name: row.patientName as string }
        : null,
    category: row.category as string,
    owner: {
      reference: row.ownerReference as string,
      name: row.ownerName as string,
    },
    priority: fromDbEnum(row.priority as string) as Priority,
    dueDate: row.dueDate as string,
    status: fromDbEnum(row.status as string) as TaskStatus,
    completedAt: (row.completedAt as Date | null)?.toISOString() ?? null,
  };
}

export async function list(
  session: AuthzSession,
  filters: TaskFilters = {},
): Promise<Paginated<TaskDTO>> {
  assert(session, "pipeline", "view");
  const { page, perPage, offset } = resolvePage(filters);

  return withSession(session, async (tx) => {
    const where = and(
      filters.status ? eq(tasks.status, toDbEnum(filters.status)) : undefined,
      filters.openOnly ? ne(tasks.status, toDbEnum("done" as TaskStatus)) : undefined,
      filters.ownerId ? eq(tasks.ownerId, filters.ownerId) : undefined,
      filters.category ? eq(tasks.category, filters.category) : undefined,
      filters.patientReference ? eq(patients.reference, filters.patientReference) : undefined,
    );

    const rows = await tx
      .select(projection)
      .from(tasks)
      .leftJoin(patients, eq(patients.id, tasks.patientId))
      .innerJoin(staff, eq(staff.id, tasks.ownerId))
      .where(where)
      .orderBy(asc(tasks.dueDate))
      .limit(perPage)
      .offset(offset);

    const [totals] = await tx
      .select({ total: count() })
      .from(tasks)
      .leftJoin(patients, eq(patients.id, tasks.patientId))
      .where(where);

    return paginate(
      rows.map((row) => toDTO(row as Record<string, unknown>)),
      totals?.total ?? 0,
      page,
      perPage,
    );
  });
}

export async function create(
  session: AuthzSession,
  input: NewTask,
  context: AuditContext,
): Promise<TaskDTO> {
  assert(session, "pipeline", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      let patientId: string | null = null;
      if (input.patientReference) {
        const [patient] = await tx
          .select({ id: patients.id })
          .from(patients)
          .where(eq(patients.reference, input.patientReference))
          .limit(1);
        // Out of scope and non-existent are the same answer, so a caller
        // cannot use task creation to probe which references exist.
        if (!patient) {
          throw new NotFoundError("That patient could not be found.", {
            reference: input.patientReference,
          });
        }
        patientId = patient.id;
      }

      const reference = `TK-${Date.now().toString(36).toUpperCase()}`;
      const [created] = await tx
        .insert(tasks)
        .values({
          reference,
          title: input.title,
          category: input.category,
          ownerId: input.ownerId,
          dueDate: input.dueDate,
          patientId,
          ...(input.priority ? { priority: toDbEnum(input.priority) } : {}),
        })
        .returning({ id: tasks.id });

      await writeAudit(tx, session, context, {
        action: "created",
        resourceType: "task",
        resourceId: reference,
        newValue: input.title,
      });

      return readOne(tx, created.id);
    }),
  );
}

export async function update(
  session: AuthzSession,
  reference: string,
  patch: TaskPatch,
  context: AuditContext,
): Promise<TaskDTO> {
  assert(session, "pipeline", "edit");

  return withSession(session, async (tx) =>
    mappingDatabaseErrors(async () => {
      const [before] = await tx
        .select({
          id: tasks.id,
          title: tasks.title,
          category: tasks.category,
          ownerId: tasks.ownerId,
          dueDate: tasks.dueDate,
          priority: tasks.priority,
          status: tasks.status,
        })
        .from(tasks)
        .where(eq(tasks.reference, reference))
        .limit(1);

      if (!before) throw new NotFoundError("That task could not be found.", { reference });

      const done = toDbEnum("done" as TaskStatus);
      const next = {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.ownerId !== undefined ? { ownerId: patch.ownerId } : {}),
        ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
        ...(patch.priority !== undefined ? { priority: toDbEnum(patch.priority) } : {}),
        ...(patch.status !== undefined ? { status: toDbEnum(patch.status) } : {}),
      };

      if (Object.keys(next).length > 0) {
        await tx
          .update(tasks)
          .set({
            ...next,
            // `completed_at` follows `status` rather than being set by the
            // caller, so the two cannot disagree about whether a task is done.
            ...(patch.status !== undefined
              ? { completedAt: toDbEnum(patch.status) === done ? new Date() : null }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, before.id));

        await writeFieldUpdates(tx, session, context, { type: "task", id: reference }, before, next);
      }

      return readOne(tx, before.id);
    }),
  );
}

/** Open tasks owned by the caller, for the dashboard panel. */
export async function mine(session: AuthzSession, limit = 10): Promise<TaskDTO[]> {
  assert(session, "pipeline", "view");

  return withSession(session, async (tx) => {
    const rows = await tx
      .select(projection)
      .from(tasks)
      .leftJoin(patients, eq(patients.id, tasks.patientId))
      .innerJoin(staff, eq(staff.id, tasks.ownerId))
      .where(and(eq(tasks.ownerId, session.staffId), ne(tasks.status, toDbEnum("done" as TaskStatus))))
      .orderBy(asc(tasks.dueDate))
      .limit(Math.min(50, Math.max(1, limit)));

    return rows.map((row) => toDTO(row as Record<string, unknown>));
  });
}

export async function statusCounts(session: AuthzSession): Promise<Record<string, number>> {
  assert(session, "pipeline", "view");

  return withSession(session, async (tx) => {
    const rows = await tx
      .select({ status: tasks.status, n: sql<number>`count(*)::int` })
      .from(tasks)
      .groupBy(tasks.status);
    return Object.fromEntries(rows.map((row) => [fromDbEnum(row.status), row.n]));
  });
}

async function readOne(
  tx: Parameters<Parameters<typeof withSession>[1]>[0],
  id: string,
): Promise<TaskDTO> {
  const [row] = await tx
    .select(projection)
    .from(tasks)
    .leftJoin(patients, eq(patients.id, tasks.patientId))
    .innerJoin(staff, eq(staff.id, tasks.ownerId))
    .where(eq(tasks.id, id))
    .limit(1);
  if (!row) throw new NotFoundError("That task could not be found.", { id });
  return toDTO(row as Record<string, unknown>);
}
