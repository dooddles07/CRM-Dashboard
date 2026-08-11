import type { NextRequest } from "next/server";
import { handle, record } from "@/lib/server/api/handle";
import * as directory from "@/lib/server/services/directory";

/**
 * Counts are computed live and inherit row-level security, so a
 * department-scoped caller sees their own department's numbers and zero
 * elsewhere. That is intended — see the service.
 */
export async function GET(request: NextRequest) {
  return handle(request, async ({ session }) => record(await directory.listDepartments(session)));
}
