import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/server/auth";
import { MfaVerifyClient } from "./mfa-verify-client";
import { MfaEnrolClient } from "./mfa-enrol-client";

/**
 * task-4-brief.md §2/§3: one route, two variants. Which one renders is
 * decided server-side from session state, not a URL flag a client could
 * set itself:
 *
 *  - A real session with `twoFactorEnabled: false` → enrolment (the
 *    abandoned-enrolment case, task-4-brief.md §6 / task-4-report.md).
 *  - A real, fully-verified session → nothing to do here, back to the app.
 *  - No session at all → verification. This is the common case (a
 *    password was just accepted and the twoFactor plugin swapped the
 *    session it briefly created for a short-lived challenge cookie — see
 *    lib/server/auth/index.ts's `databaseHooks` comment) but it's also
 *    reached by a stale/expired challenge or a direct visit with nothing
 *    pending; `verifyMfaAction` surfaces that as a clear error instead of
 *    a crash rather than this page trying to peek at Better Auth's signed,
 *    httpOnly 2FA cookie itself (see actions.ts's header comment on why
 *    that cookie's resolution isn't part of the plugin's public surface).
 *
 * `?remember=1` carries the "keep me signed in" checkbox from `/login`
 * across this redirect — not sensitive, just a UI preference, so a query
 * param is fine for it (unlike the TOTP secret or recovery codes, which
 * only ever travel as Server Action return values).
 */
export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ remember?: string }>;
}) {
  const { remember } = await searchParams;
  const keepSignedIn = remember === "1";

  const headerList = await nextHeaders();
  const session = await auth.api.getSession({ headers: headerList });

  if (session) {
    if (session.user.twoFactorEnabled) {
      redirect("/");
    }
    return <MfaEnrolClient keepSignedIn={keepSignedIn} />;
  }

  return <MfaVerifyClient keepSignedIn={keepSignedIn} />;
}
