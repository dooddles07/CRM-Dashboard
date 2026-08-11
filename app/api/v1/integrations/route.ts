import type { NextRequest } from "next/server";
import { handle, record } from "@/lib/server/api/handle";
import * as integrations from "@/lib/server/services/integrations";

/** Credentials are never in the response — the DTO reports `hasSecret` only. */
export async function GET(request: NextRequest) {
  return handle(request, async ({ session }) => record(await integrations.list(session)));
}
