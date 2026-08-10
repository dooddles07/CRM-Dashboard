import { db } from "@/lib/server/db";
import { outboundMessages } from "@/lib/server/db/schema/comms";
import { encryptPiiRequired, maskEmail } from "@/lib/server/db/pii";

/**
 * plan/02-authentication.md §6.2/§7, task-3-brief.md §2/§4. Shared by
 * `lib/server/auth/invitations.ts` and `lib/server/auth/password-reset.ts`
 * — both need the identical "sandbox mode" delivery shape the plan
 * describes once: "the link is written to the outbound message log and
 * the server console rather than sent." Phase 07 owns real provider
 * adapters; `provider: "console-sandbox"` is this task's own naming
 * choice, self-documenting as non-production.
 */
export async function deliverSandboxLink(params: {
  email: string;
  link: string;
  sourceKind: "invitation" | "password_reset";
  sourceId: string;
  body: string;
}): Promise<void> {
  await db.insert(outboundMessages).values({
    channel: "email",
    patientId: null,
    toEncrypted: encryptPiiRequired(params.email),
    toMasked: maskEmail(params.email),
    body: params.body,
    sourceKind: params.sourceKind,
    sourceId: params.sourceId,
    provider: "console-sandbox",
    status: "sent",
    sentAt: new Date(),
  });
  // plan §6.2, verbatim: "written to ... the server console" — deliberate,
  // dev-visible channel, not a debug leftover (task-3-brief.md §2).
  console.log(`[sandbox email] ${params.sourceKind} link for ${params.email}: ${params.link}`);
}

/**
 * `NEXT_PUBLIC_APP_URL` isn't set anywhere in this codebase yet — no
 * screen has needed a self-referential absolute URL before Task 3.
 * `plan/07-jobs-and-messaging.md`'s CI config already expects an `APP_URL`
 * secret for a later phase, so this reuses that name rather than inventing
 * a new one, with a localhost fallback for `npm run provision` /
 * `npm run dev` use. Task 4 / deployment (Phase 10) need to set `APP_URL`
 * for real environments — flagged in task-3-report.md.
 */
export function appBaseUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}
