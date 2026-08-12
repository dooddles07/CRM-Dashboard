"use server";

import { headers as nextHeaders } from "next/headers";
import { updateTag } from "next/cache";
import { requireSession, resolveClientIp } from "@/lib/server/auth/session";
import { assert, assertExport } from "@/lib/server/authz/policy";
import { writeAudit } from "@/lib/server/audit/write";
import { withSession } from "@/lib/server/db/session";
import * as patients from "@/lib/server/services/patients";
import { patientPatchSchema, archiveSchema } from "@/lib/server/api/schemas";
import { ServiceError, UnauthorizedError } from "@/lib/server/services/errors";
import { tags } from "@/lib/server/cache";

/**
 * plan/06-screen-migration.md §3. Every write from a screen is a Server
 * Action, one file per domain, validated with the same Zod schema the API
 * route uses — "one schema, two callers".
 *
 * `updateTag` rather than `revalidateTag`: it expires and refreshes within
 * the same request, so an archived row is gone from the list before the
 * dialog closes. `revalidateTag` shows stale content meanwhile, which is
 * wrong for a form the user just submitted.
 *
 * Every action returns a result rather than throwing. A thrown error in a
 * Server Action reaches the client as an opaque digest, and these errors have
 * messages written for the person reading them.
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
  console.error(
    JSON.stringify({
      event: "action.unhandled",
      message: error instanceof Error ? error.message : String(error),
      cause: error instanceof Error && error.cause ? String((error.cause as Error).message) : null,
    }),
  );
  return { ok: false, code: "INTERNAL", message: "That could not be saved. Try again." };
}

export async function updatePatient(
  reference: string,
  patch: unknown,
): Promise<ActionResult> {
  try {
    const { session, audit } = await context();
    // The same schema app/api/v1/patients/[reference] parses. A Server Action
    // is an HTTP endpoint with a nicer calling convention; its input is no
    // more trustworthy for being typed on the client.
    await patients.update(session, reference, patientPatchSchema.parse(patch), audit);
    updateTag(tags.patients());
    updateTag(tags.patient(reference));
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function archivePatient(reference: string, reason: unknown): Promise<ActionResult> {
  try {
    const { session, audit } = await context();
    const parsed = archiveSchema.parse({ reason });
    await patients.archive(session, reference, parsed.reason, audit);
    updateTag(tags.patients());
    updateTag(tags.patient(reference));
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function restorePatient(reference: string): Promise<ActionResult> {
  try {
    const { session, audit } = await context();
    await patients.restore(session, reference, audit);
    updateTag(tags.patients());
    updateTag(tags.patient(reference));
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/**
 * docs/SECURITY.md §2.3: "An export is a bulk reveal. Treating it as a lesser
 * event would leave the largest disclosures unlogged."
 *
 * This replaces the client-side `logAudit` the screen used to call, which
 * wrote to a browser store and convinced nobody. The entry now lands in
 * `audit_log`, names the filter and the row count, and cannot be deleted.
 *
 * `assertExport` requires `view` on the area **and** the `export` capability,
 * so Receptionist — who can read patients but not export them — is refused
 * here rather than at the point the file would have been produced.
 */
export async function recordPatientExport(
  filterDescription: string,
  rowCount: number,
): Promise<ActionResult> {
  try {
    const { session, audit } = await context();
    assert(session, "patients", "view");
    // Contact columns are masked in this export, so `reveal` is not required.
    // An export that included them would pass `{ contactColumns: true }` and
    // charge every row to the reveal budget.
    assertExport(session, "patients");

    await withSession(session, async (tx) => {
      await writeAudit(tx, session, audit, {
        action: "exported",
        resourceType: "patient_list",
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
