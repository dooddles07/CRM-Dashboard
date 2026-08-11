import type { NextRequest } from "next/server";
import { handle, searchParamsOf } from "@/lib/server/api/handle";
import { auditFiltersSchema } from "@/lib/server/api/schemas";
import * as audit from "@/lib/server/services/audit";
import type { AuditAction } from "@/lib/types";

/**
 * plan §3.1: "/audit uses cursor pagination instead. It grows without bound
 * and is only ever read in timestamp order, so OFFSET on page 700 is a table
 * scan."
 *
 * So this returns `{ data, nextCursor }` rather than the collection envelope —
 * `meta.totalPages` would require a count over an unbounded table on every
 * request, which is the cost the cursor exists to avoid.
 *
 * No scope. `audit:read` is a role capability, and no token carries roles.
 */
export async function GET(request: NextRequest) {
  return handle(request, async ({ session }) => {
    const filters = auditFiltersSchema.parse(searchParamsOf(request));
    return audit.list(session, {
      ...filters,
      action: filters.action as AuditAction | undefined,
    });
  });
}
