import type { NextRequest } from "next/server";
import { handle, record } from "@/lib/server/api/handle";
import { permissionSet } from "@/lib/server/authz/policy";

/**
 * plan/05-http-api.md §5 and plan/03-authorisation.md §3.1. Session, role,
 * department, and the resolved permission set.
 *
 * Phase 03 deliberately stopped short of this route and shipped
 * `permissionSet()` instead, so the shell could filter without two phases
 * both claiming `/api/v1`. This is that function served over HTTP — the same
 * value the rail already filters against, not a second computation of it.
 *
 * docs/SECURITY.md §3.2: "UI hiding stays as a courtesy. A hidden button is
 * not an access control." Everything here is advisory. The server re-checks
 * every one of these decisions on the request that acts on them, and nothing
 * server-side reads this back.
 */
export async function GET(request: NextRequest) {
  return handle(request, async ({ session, token }) =>
    record({
      staffId: session.staffId,
      role: session.role,
      departmentId: session.departmentId,
      impersonated: session.impersonated,
      /** True when the caller is a machine. Tokens can never reveal. */
      viaToken: token !== null,
      permissions: permissionSet(session),
    }),
  );
}
