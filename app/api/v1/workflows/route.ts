import type { NextRequest } from "next/server";
import { handle, record } from "@/lib/server/api/handle";
import * as workflows from "@/lib/server/services/workflows";

/** Not paginated: there are tens of workflows, not thousands. */
export async function GET(request: NextRequest) {
  return handle(request, async ({ session }) => record(await workflows.list(session)));
}
