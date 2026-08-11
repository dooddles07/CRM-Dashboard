import type { NextRequest } from "next/server";
import { handle, jsonBody, record } from "@/lib/server/api/handle";
import { appointmentPatchSchema } from "@/lib/server/api/schemas";
import * as appointments from "@/lib/server/services/appointments";

export async function GET(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return handle(
    request,
    async ({ session }) => record(await appointments.byReference(session, reference)),
    { scope: "appointments:read" },
  );
}

/** Reschedules and status changes share a path — both can hit the overlap constraint. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return handle(
    request,
    async ({ session, audit }) => {
      const patch = await jsonBody(request, appointmentPatchSchema);
      return record(await appointments.update(session, reference, patch, audit));
    },
    { scope: "appointments:write" },
  );
}
