import type { NextRequest } from "next/server";
import { handle, jsonBody, record } from "@/lib/server/api/handle";
import { moveStageSchema } from "@/lib/server/api/schemas";
import * as leads from "@/lib/server/services/leads";

/** The stage change and its history row are one transaction, in the service. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return handle(
    request,
    async ({ session, audit }) => {
      const { stage } = await jsonBody(request, moveStageSchema);
      return record(await leads.moveStage(session, reference, stage, audit));
    },
    { scope: "pipeline:write" },
  );
}
