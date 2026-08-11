import type { NextRequest } from "next/server";
import { handle, record } from "@/lib/server/api/handle";
import * as analytics from "@/lib/server/services/analytics";

/**
 * Aggregates only — no PII in any return shape. Figures are scoped by
 * row-level security, so this answers "what is happening in your work", not
 * "in the hospital", unless the caller sees every department.
 */
export async function GET(request: NextRequest) {
  return handle(
    request,
    async ({ session }) =>
      record({
        kpis: await analytics.dashboard(session),
        patientsByDepartment: await analytics.patientsByDepartment(session),
        leadsBySource: await analytics.leadsBySource(session),
        pipelineValue: await analytics.pipelineValue(session),
      }),
    { scope: "reports:read" },
  );
}
