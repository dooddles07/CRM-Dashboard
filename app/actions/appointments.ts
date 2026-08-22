"use server";

import { headers as nextHeaders } from "next/headers";
import { updateTag } from "next/cache";
import { ZodError } from "zod";
import { requireSession, resolveClientIp } from "@/lib/server/auth/session";
import * as appointments from "@/lib/server/services/appointments";
import { newAppointmentSchema, appointmentPatchSchema, archiveSchema } from "@/lib/server/api/schemas";
import { ServiceError, UnauthorizedError } from "@/lib/server/services/errors";
import { tags } from "@/lib/server/cache";

/**
 * 02-appointments ticket, plan/06-screen-migration.md §3 pattern: one Server
 * Action file per domain, same schemas the API route uses, every action
 * returns a result instead of throwing (see app/actions/patients.ts for why).
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
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.join(".");
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: field ? `${field}: ${issue.message}` : (issue?.message ?? "Check the form and try again."),
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

export async function createAppointment(
  input: unknown,
): Promise<ActionResult<{ reference: string }>> {
  try {
    const { session, audit } = await context();
    const parsed = newAppointmentSchema.parse(input);
    const created = await appointments.create(session, parsed, audit);
    updateTag(tags.appointments());
    return { ok: true, data: { reference: created.reference } };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Reschedules and plain field edits share this path — same as the service
 * function it calls. Status transitions (confirm, check-in, complete) also
 * go through here with a `{ status }` patch; cancelling has its own action
 * below because it requires a reason.
 */
export async function updateAppointment(
  reference: string,
  patch: unknown,
): Promise<ActionResult> {
  try {
    const { session, audit } = await context();
    await appointments.update(session, reference, appointmentPatchSchema.parse(patch), audit);
    updateTag(tags.appointments());
    updateTag(tags.appointment(reference));
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelAppointment(reference: string, reason: unknown): Promise<ActionResult> {
  try {
    const { session, audit } = await context();
    const parsed = archiveSchema.parse({ reason });
    await appointments.cancel(session, reference, parsed.reason, audit);
    updateTag(tags.appointments());
    updateTag(tags.appointment(reference));
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
