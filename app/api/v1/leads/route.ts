import type { NextRequest } from "next/server";
import { collection, handle, searchParamsOf } from "@/lib/server/api/handle";
import { leadFiltersSchema } from "@/lib/server/api/schemas";
import * as leads from "@/lib/server/services/leads";

export async function GET(request: NextRequest) {
  return handle(
    request,
    async ({ session }) => {
      const filters = leadFiltersSchema.parse(searchParamsOf(request));
      return collection(await leads.list(session, filters), request);
    },
    { scope: "pipeline:read" },
  );
}
