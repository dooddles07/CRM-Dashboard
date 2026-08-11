"use server";

import { headers as nextHeaders } from "next/headers";
import { requireSession, resolveClientIp } from "@/lib/server/auth/session";
import { reveal, type RevealField, type RevealResource } from "@/lib/server/services/reveal";
import { UnauthorizedError } from "@/lib/server/services/errors";
import { ServiceError } from "@/lib/server/services/errors";

/**
 * plan/06-screen-migration.md §4. What `Protected` calls instead of writing to
 * the store.
 *
 * The whole point of the migration for this component: before, `reveal()` was
 * a `set()` in a browser store and the plaintext was already in the bundle.
 * Now the plaintext exists only after this action returns, and only because
 * an audit entry committed first.
 *
 * Returns a discriminated result rather than throwing. A thrown error in a
 * Server Action reaches the client as a digest with no message, and this is a
 * case where the message is the point — "Your role cannot reveal contact
 * details" is what the user needs to read, not a reference number.
 */
export type RevealResult =
  | { ok: true; value: string; auditId: string; expiresAt: string }
  | { ok: false; code: string; message: string };

export async function revealAction(
  resource: RevealResource,
  reference: string,
  field: RevealField,
  reason?: string,
): Promise<RevealResult> {
  try {
    const authed = await requireSession();
    if (!authed) throw new UnauthorizedError("You are not signed in.");

    const headerList = await nextHeaders();
    const result = await reveal(
      authed.authz,
      {
        actorName: authed.staff.name,
        ipAddress: resolveClientIp(headerList),
        userAgent: headerList.get("user-agent"),
        sessionId: authed.session.id,
      },
      resource,
      reference,
      field,
      reason,
    );

    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof ServiceError) {
      return { ok: false, code: error.code, message: error.message };
    }
    // Anything unmapped is logged here and reported as a generic failure —
    // the client must not receive a database message.
    console.error(
      JSON.stringify({
        event: "reveal.unhandled",
        message: error instanceof Error ? error.message : String(error),
        cause: error instanceof Error && error.cause ? String((error.cause as Error).message) : null,
      }),
    );
    return {
      ok: false,
      code: "INTERNAL",
      message: "That could not be revealed just now. Try again.",
    };
  }
}
