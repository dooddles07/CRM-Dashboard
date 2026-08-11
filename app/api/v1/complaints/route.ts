import type { NextRequest } from "next/server";
import { collection, handle, searchParamsOf } from "@/lib/server/api/handle";
import { pageQuery } from "@/lib/server/api/schemas";
import * as complaints from "@/lib/server/services/complaints";

/** Thin over the service. Filters beyond paging are added as screens need them. */
export async function GET(request: NextRequest) {
  return handle(request, async ({ session }) => {
    const filters = pageQuery.parse(searchParamsOf(request));
    return collection(await complaints.list(session, filters), request);
  });
}
