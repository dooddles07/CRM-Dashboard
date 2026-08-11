import type { NextRequest } from "next/server";
import { handle, jsonBody, record } from "@/lib/server/api/handle";
import { preferencesPatchSchema } from "@/lib/server/api/schemas";
import * as preferences from "@/lib/server/services/preferences";

export async function GET(request: NextRequest) {
  return handle(request, async ({ session }) => record(await preferences.get(session)));
}

/**
 * plan §5. Density, theme, rail state.
 *
 * `staff_id` is never in the body — the service takes it from the session, so
 * there is no parameter in which to write someone else's preferences even
 * before the RLS policy refuses it.
 */
export async function PATCH(request: NextRequest) {
  return handle(request, async ({ session }) => {
    const patch = await jsonBody(request, preferencesPatchSchema);
    return record(await preferences.update(session, patch));
  });
}
