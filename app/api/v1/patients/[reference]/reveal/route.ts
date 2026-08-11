import type { NextRequest } from "next/server";
import { handle, jsonBody, record } from "@/lib/server/api/handle";
import { revealSchema } from "@/lib/server/api/schemas";
import { reveal } from "@/lib/server/services/reveal";

/**
 * plan/05-http-api.md §1: "the one operation the security model rests on."
 *
 * Deliberately carries **no `scope`**. plan §4: "No token may hold `reveal`."
 * A scope option here would imply one could be granted; instead a machine
 * caller reaches the service and is refused by `holds()`, because
 * `authenticateToken` marks token sessions `impersonated` and impersonated
 * sessions cannot reveal. One mechanism, and it lives in the service where
 * every other caller passes through it too.
 *
 * The whole transaction is Phase 04 §5: row before capability so out-of-scope
 * is 404 rather than 403, audit insert before decryption so a failed entry
 * rolls back the disclosure.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return handle(request, async ({ session, audit }) => {
    const { field, reason } = await jsonBody(request, revealSchema);
    return record(await reveal(session, audit, "patient", reference, field, reason));
  });
}
