import type { NextRequest } from "next/server";
import { collection, handle, jsonBody, record, searchParamsOf } from "@/lib/server/api/handle";
import { appointmentFiltersSchema, newAppointmentSchema } from "@/lib/server/api/schemas";
import * as appointments from "@/lib/server/services/appointments";

export async function GET(request: NextRequest) {
  return handle(
    request,
    async ({ session }) => {
      const filters = appointmentFiltersSchema.parse(searchParamsOf(request));
      return collection(await appointments.list(session, filters), request);
    },
    { scope: "appointments:read" },
  );
}

/**
 * plan §5: "no availability pre-check. The exclusion constraint answers, and
 * `23P01` becomes 409. A pre-check races two receptionists."
 *
 * Nothing in this handler knows that. The service inserts, the constraint
 * refuses, `mappingDatabaseErrors` turns the SQLSTATE into a ConflictError,
 * and `handle` renders it as 409 SLOT_CONFLICT.
 */
export async function POST(request: NextRequest) {
  return handle(
    request,
    async ({ session, audit }) => {
      const input = await jsonBody(request, newAppointmentSchema);
      return record(await appointments.create(session, input, audit));
    },
    { scope: "appointments:write" },
  );
}
