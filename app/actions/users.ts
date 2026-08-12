"use server";

import { z } from "zod";
import { headers as nextHeaders } from "next/headers";
import { updateTag } from "next/cache";
import { requireSession, resolveClientIp } from "@/lib/server/auth/session";
import { assert } from "@/lib/server/authz/policy";
import { isRole } from "@/lib/server/authz/matrix";
import { createInvitation } from "@/lib/server/auth/invitations";
import { writeAudit } from "@/lib/server/audit/write";
import { withSession } from "@/lib/server/db/session";
import { ServiceError, UnauthorizedError } from "@/lib/server/services/errors";
import { tags } from "@/lib/server/cache";

/**
 * plan/02-authentication.md §6.2 gave `/admin/users` an invite flow and
 * Phase 02 shipped without wiring it — the screen's dialog wrote a
 * client-side audit entry and showed a toast, and no invitation existed. This
 * connects it to `createInvitation`, which has been sitting unused since
 * Phase 02 Task 3.
 *
 * Requires `users: edit`: Super Admin and Hospital Admin only. Inviting
 * someone is granting them a role, so it is bounded by the same area that
 * governs changing one.
 */

/**
 * No `name` field, deliberately.
 *
 * `createInvitation` does not take one and `acceptInvitation` does: the
 * invitee types their own name when they set their password. Collecting it
 * here would produce a value the system then ignores, and a form field whose
 * input is discarded is worse than no field.
 */
const inviteSchema = z.object({
  email: z.string().trim().email("That is not a valid email address."),
  role: z.string().refine(isRole, "That is not a role this application recognises."),
  /** `null` means hospital-wide. Department-scoped roles need one; the DB enforces it. */
  departmentId: z.string().uuid().nullable(),
});

export type InviteResult =
  | { ok: true; email: string; expiresAt: string }
  | { ok: false; code: string; message: string };

export async function inviteUser(input: unknown): Promise<InviteResult> {
  try {
    const authed = await requireSession();
    if (!authed) throw new UnauthorizedError("You are not signed in.");
    assert(authed.authz, "users", "edit");

    const parsed = inviteSchema.parse(input);
    const headerList = await nextHeaders();

    const invitation = await createInvitation({
      email: parsed.email,
      role: parsed.role,
      departmentId: parsed.departmentId,
      invitedByStaffId: authed.authz.staffId,
    });

    // The audit entry names who invited whom and into what role. A role grant
    // with no record of who made it is the gap this closes.
    await withSession(authed.authz, async (tx) => {
      await writeAudit(
        tx,
        authed.authz,
        {
          actorName: authed.staff.name,
          ipAddress: resolveClientIp(headerList),
          userAgent: headerList.get("user-agent"),
          sessionId: authed.session.id,
        },
        {
          action: "created",
          resourceType: "invitation",
          resourceId: invitation.invitationId,
          field: "role",
          // The email is recorded; the token never is. A token in the audit
          // log would be a working credential in a table many people read.
          newValue: `${parsed.email} as ${parsed.role}`,
        },
      );
    });

    updateTag(tags.staff());

    return {
      ok: true,
      email: parsed.email,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof ServiceError) {
      return { ok: false, code: error.code, message: error.message };
    }
    if (error instanceof z.ZodError) {
      const first = error.issues[0];
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        message: first?.message ?? "Check those details and try again.",
      };
    }
    // `createInvitation` throws plain Errors for its own refusals — an
    // already-onboarded email, an unknown role. Their messages are written for
    // a person and are safe to show.
    if (error instanceof Error && error.message.startsWith("createInvitation:")) {
      return {
        ok: false,
        code: "CONFLICT",
        message: error.message.replace("createInvitation: ", ""),
      };
    }
    console.error(
      JSON.stringify({
        event: "invite.unhandled",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return { ok: false, code: "INTERNAL", message: "That invitation could not be sent." };
  }
}
