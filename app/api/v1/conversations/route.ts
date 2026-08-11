import type { NextRequest } from "next/server";
import { collection, handle, searchParamsOf } from "@/lib/server/api/handle";
import { pageQuery } from "@/lib/server/api/schemas";
import * as conversations from "@/lib/server/services/conversations";

export async function GET(request: NextRequest) {
  return handle(request, async ({ session }) => {
    const filters = pageQuery.parse(searchParamsOf(request));
    return collection(await conversations.list(session, filters), request);
  });
}
