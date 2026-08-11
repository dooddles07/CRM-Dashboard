import type { NextRequest } from "next/server";
import { handle, jsonBody, record } from "@/lib/server/api/handle";
import { archiveSchema, patientPatchSchema } from "@/lib/server/api/schemas";
import * as patients from "@/lib/server/services/patients";

/**
 * Addressed by business reference, never by UUID (plan §3) — staff quote
 * `PT-102938` and support tickets contain it.
 *
 * An out-of-scope record answers 404 here, not 403, because the service
 * cannot distinguish "hidden by row-level security" from "does not exist" and
 * must not: a 403 would confirm the record exists.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return handle(
    request,
    async ({ session, audit }) => record(await patients.byReference(session, reference, audit)),
    { scope: "patients:read" },
  );
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return handle(
    request,
    async ({ session, audit }) => {
      const patch = await jsonBody(request, patientPatchSchema);
      return record(await patients.update(session, reference, patch, audit));
    },
    { scope: "patients:write" },
  );
}

/** Soft delete. The row, its history and its audit trail survive. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return handle(
    request,
    async ({ session, audit }) => {
      const { reason } = await jsonBody(request, archiveSchema);
      await patients.archive(session, reference, reason, audit);
      return record({ archived: true, reference });
    },
    { scope: "patients:write" },
  );
}
