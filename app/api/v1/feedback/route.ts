import type { NextRequest } from "next/server";
import { collection, handle, searchParamsOf } from "@/lib/server/api/handle";
import { pageQuery } from "@/lib/server/api/schemas";
import * as feedback from "@/lib/server/services/feedback";

/** Thin over the service. Filters beyond paging are added as screens need them. */
export async function GET(request: NextRequest) {
  return handle(request, async ({ session }) => {
    const filters = pageQuery.parse(searchParamsOf(request));
    return collection(await feedback.list(session, filters), request);
  });
}
