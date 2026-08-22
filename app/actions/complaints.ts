"use server";

import { z } from "zod";
import { headers as nextHeaders } from "next/headers";
import { updateTag } from "next/cache";
import { requireSession, resolveClientIp } from "@/lib/server/auth/session";
import * as complaints from "@/lib/server/services/complaints";
import * as directory from "@/lib/server/services/directory";
import { complaintPatchSchema, resolveComplaintSchema } from "@/lib/server/api/schemas";
import { ServiceError, UnauthorizedError } from "@/lib/server/services/errors";
import { tags } from "@/lib/server/cache";

/** 04-complaints ticket. Same action-file pattern as app/actions/appointments.ts. */

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
    const issue = error.issues[0];
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: issue?.message ?? "Check those details and try again.",
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

/**
 * Status/priority/owner transitions (assign, investigate, close, reassign)
 * all go through here, same as appointments' `updateAppointment`. `owner`
 * arrives as a business reference and is resolved to a UUID here, so no
 * internal key crosses the wire.
 */
export async function updateComplaint(
  reference: string,
  patch: { status?: unknown; priority?: unknown; ownerReference?: string | null },
): Promise<ActionResult> {
  try {
    const { session, audit } = await context();
    const ownerId =
      patch.ownerReference === undefined
        ? undefined
        : patch.ownerReference === null
          ? null
          : await directory.staffIdByReference(session, patch.ownerReference);
    const parsed = complaintPatchSchema.parse({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(ownerId !== undefined ? { ownerId } : {}),
    });
    await complaints.update(session, reference, parsed, audit);
    updateTag(tags.complaints());
    updateTag(tags.complaint(reference));
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function resolveComplaint(reference: string, resolution: unknown): Promise<ActionResult> {
  try {
    const { session, audit } = await context();
    const parsed = resolveComplaintSchema.parse({ resolution });
    await complaints.resolve(session, reference, parsed.resolution, audit);
    updateTag(tags.complaints());
    updateTag(tags.complaint(reference));
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
