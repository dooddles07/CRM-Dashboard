import { z } from "zod";
import type { NextRequest } from "next/server";
import { handle, jsonBody, record } from "@/lib/server/api/handle";
import * as conversations from "@/lib/server/services/conversations";

const sendSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  /**
   * docs/API.md §2.4 sends this explicitly rather than defaulting it. An
   * omitted flag defaulting to `false` would mean a client bug delivers a
   * private note to the patient; requiring it makes the caller state which
   * kind of message this is.
   */
  internal: z.boolean(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return handle(request, async ({ session }) => record(await conversations.thread(session, reference)));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return handle(request, async ({ session, audit }) => {
    const input = await jsonBody(request, sendSchema);
    return record(await conversations.send(session, reference, input, audit));
  });
}
