import { NextResponse, type NextRequest } from "next/server";
import { handle, searchParamsOf } from "@/lib/server/api/handle";
import { auditFiltersSchema } from "@/lib/server/api/schemas";
import * as audit from "@/lib/server/services/audit";
import type { AuditAction } from "@/lib/types";

/**
 * plan/05-http-api.md §5: "writes an audit entry about itself before
 * streaming."
 *
 * An export of the audit log is the most sensitive read in the product — the
 * record of who looked at whom, in bulk — so it is itself an audited event,
 * and the service writes that entry before reading anything.
 *
 * The one route whose success path is not the JSON envelope: the thing being
 * asked for is a file. `handle` still resolves the caller, enforces the rate
 * limit and maps every error, so the exception is the response shape only.
 *
 * `Content-Disposition: attachment` is not optional. Rendered inline, a CSV
 * of the audit log becomes a page the browser will happily display to
 * whatever else is on screen.
 */
export async function GET(request: NextRequest) {
  return handle(request, async ({ session, audit: context }) => {
    const filters = auditFiltersSchema.parse(searchParamsOf(request));
    const csv = await audit.exportCsv(session, context, {
      ...filters,
      action: filters.action as AuditAction | undefined,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="careflow-audit-${stamp}.csv"`,
        // Never cached: it is a point-in-time extract of sensitive data, and
        // a shared cache holding it would serve one reviewer's export to
        // another.
        "cache-control": "no-store",
      },
    });
  });
}

export const dynamic = "force-dynamic";
