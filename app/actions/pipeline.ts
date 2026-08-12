"use server";

import { z } from "zod";
import { headers as nextHeaders } from "next/headers";
import { updateTag } from "next/cache";
import { requireSession, resolveClientIp } from "@/lib/server/auth/session";
import { assert, assertExport, type Area } from "@/lib/server/authz/policy";
import { writeAudit } from "@/lib/server/audit/write";
import { withSession } from "@/lib/server/db/session";
import * as tasks from "@/lib/server/services/tasks";
import * as directory from "@/lib/server/services/directory";
import { ServiceError, UnauthorizedError } from "@/lib/server/services/errors";
import { tags } from "@/lib/server/cache";

/**
 * plan/06-screen-migration.md §3. Writes from the pipeline screens.
 *
 * The screens these replace called `logAudit` on the client store — an
 * "export" that recorded a bulk disclosure in browser memory, and a "create
 * task" that created nothing. Both are real now.
 */

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; code: string; message: string };

async function context() {
  const authed = await requireSession();
  if (!authed) throw new UnauthorizedError("You are not signed in.");
  const headerList = await nextHeaders();
  return {
    session: authed.authz,
    audit: {
      actorName: authed.staff.name,
      ipAddress: resolveClientIp(headerList),
      userAgent: headerList.get("user-agent"),
      sessionId: authed.session.id,
    },
  };
}

function failure(error: unknown): { ok: false; code: string; message: string } {
  if (error instanceof ServiceError) {
    return { ok: false, code: error.code, message: error.message };
  }
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: error.issues[0]?.message ?? "Check those details and try again.",
    };
  }
  console.error(
    JSON.stringify({
      event: "action.unhandled",
      message: error instanceof Error ? error.message : String(error),
      cause: error instanceof Error && error.cause ? String((error.cause as Error).message) : null,
    }),
  );
  return { ok: false, code: "INTERNAL", message: "That could not be saved. Try again." };
}

const newTaskSchema = z.object({
  title: z.string().trim().min(1, "A title is required.").max(300),
  category: z.string().trim().min(1).max(100),
  ownerReference: z.string().min(1, "Choose an owner.").max(64),
  dueDate: z.string().date(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  patientReference: z.string().max(64).nullable().optional(),
});

export async function createTask(input: unknown): Promise<ActionResult<{ reference: string }>> {
  try {
    const { session, audit } = await context();
    const parsed = newTaskSchema.parse(input);
    // The picker deals in references because that is what every screen shows;
    // the service takes the UUID. Resolving here keeps internal keys off the
    // wire in both directions.
    const owner = await directory.staffIdByReference(session, parsed.ownerReference);
    const created = await tasks.create(
      session,
      { ...parsed, ownerId: owner },
      audit,
    );
    updateTag(tags.tasks());
    return { ok: true, data: { reference: created.reference } };
  } catch (error) {
    return failure(error);
  }
}

/**
 * One export recorder for every list screen, rather than one per resource.
 *
 * docs/SECURITY.md §2.3: "An export is a bulk reveal." The area is passed in
 * because `assertExport` needs it — a caller exporting the pipeline must hold
 * `pipeline: view` and the `export` capability, and Receptionist holds
 * neither for this area even though they can read patients.
 *
 * Contact columns are not included in any of these exports, so `reveal` is
 * not required and nothing is charged to the reveal budget. An export that
 * did include them would pass `{ contactColumns: true }` and must.
 */
export async function recordExport(
  area: Area,
  resourceType: string,
  filterDescription: string,
  rowCount: number,
): Promise<ActionResult> {
  try {
    const { session, audit } = await context();
    assert(session, area, "view");
    assertExport(session, area);

    await withSession(session, async (tx) => {
      await writeAudit(tx, session, audit, {
        action: "exported",
        resourceType,
        resourceId: filterDescription,
        field: "rows",
        newValue: String(rowCount),
      });
    });

    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
