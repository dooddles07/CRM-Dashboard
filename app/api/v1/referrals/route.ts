import type { NextRequest } from "next/server";
import { collection, handle, searchParamsOf } from "@/lib/server/api/handle";
import { pageQuery } from "@/lib/server/api/schemas";
import * as referrals from "@/lib/server/services/referrals";

/** Thin over the service. Filters beyond paging are added as screens need them. */
export async function GET(request: NextRequest) {
  return handle(request, async ({ session }) => {
    const filters = pageQuery.parse(searchParamsOf(request));
    return collection(await referrals.list(session, filters), request);
  });
}
