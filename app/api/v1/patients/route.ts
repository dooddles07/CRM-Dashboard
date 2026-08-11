import type { NextRequest } from "next/server";
import { collection, handle, searchParamsOf } from "@/lib/server/api/handle";
import { patientFiltersSchema } from "@/lib/server/api/schemas";
import * as patients from "@/lib/server/services/patients";

/**
 * plan/05-http-api.md §2, and the shape every other handler copies.
 *
 * Four steps and nothing else: `handle` resolves the caller and owns error
 * mapping, Zod validates the input, the service does the work, an envelope
 * wraps the result. There is no try/catch and no database query here, which
 * are two of plan §7's acceptance criteria.
 */
export async function GET(request: NextRequest) {
  return handle(
    request,
    async ({ session }) => {
      const filters = patientFiltersSchema.parse(searchParamsOf(request));
      return collection(await patients.list(session, filters), request);
    },
    { scope: "patients:read" },
  );
}
