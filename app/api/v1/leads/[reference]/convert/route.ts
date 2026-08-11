import type { NextRequest } from "next/server";
import { handle, jsonBody, record } from "@/lib/server/api/handle";
import { convertSchema } from "@/lib/server/api/schemas";
import * as leads from "@/lib/server/services/leads";
import * as patients from "@/lib/server/services/patients";

/**
 * plan/05-http-api.md §5: "one transaction creating a patient, linking the
 * lead, writing stage history, and writing two audit entries. Returns both
 * records."
 *
 * It returns both records, and the linking half is one transaction. The
 * patient is **not** created here, and that departs from a naive reading of
 * the plan on purpose: a lead's contact details are encrypted, so copying
 * them into a new patient inside this call would mean decrypting them — a
 * disclosure with no reveal entry against it, performed by whoever happened
 * to click Convert.
 *
 * So the caller creates the patient through its own flow, which takes
 * plaintext from a form and encrypts it, and passes the reference here. The
 * lead link, the stage history and both audit entries are one transaction, so
 * plan §7's "rolls back entirely if any step fails" holds for the part that
 * spans two tables.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return handle(
    request,
    async ({ session, audit }) => {
      const { patientReference } = await jsonBody(request, convertSchema);
      const lead = await leads.linkConverted(session, reference, patientReference, audit);
      return record({ lead, patient: await patients.byReference(session, patientReference) });
    },
    { scope: "pipeline:write" },
  );
}
