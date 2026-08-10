import { headers as nextHeaders } from "next/headers";
import { eq } from "drizzle-orm";
import { getIp } from "@better-auth/core/utils/ip";
import { auth } from "./index";
import { db } from "@/lib/server/db";
import { session as sessionTable } from "@/lib/server/db/schema/auth";
import { staff } from "@/lib/server/db/schema/people";

/** plan/02-authentication.md §4: "Idle timeout | 30 minutes". */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export type StaffRow = typeof staff.$inferSelect;

/**
 * What `requireSession()` (and, indirectly, proxy.ts) resolve to on
 * success. Deliberately carries the resolved `staff` row, not just the
 * Better Auth `user` — task-2-brief.md §3: "every later consumer
 * (services, screens) needs `staff.role`, `staff.departmentId`, etc., not
 * just auth identity." The services/screens that will actually read those
 * fields are Phase 04's job; this type just shapes the value for them.
 */
export interface AuthedSession {
  user: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>["user"];
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>["session"];
  staff: StaffRow;
}

/**
 * Resolves and validates the current request's session against every
 * server-side invariant plan §4 and the last paragraph of §2.2 require:
 *
 *  1. A Better Auth session actually exists for the request (cookie present,
 *     token valid, not past its absolute `expiresIn` ceiling — all handled
 *     by `auth.api.getSession`).
 *  2. It has not idled out. `updateAge: 0` in ./index.ts turns off Better
 *     Auth's own sliding-expiration refresh, so idle timeout is enforced
 *     here, by hand, against `session.last_seen_at` (the column Task 1
 *     added to the `session` table) rather than trusting the cookie's
 *     `maxAge` — a cookie's expiry is a client-side hint only (plan §4).
 *     `last_seen_at` is read/written directly against the Drizzle `session`
 *     table rather than through Better Auth's own field-filtering
 *     (`additionalFields`), since that column isn't declared to Better
 *     Auth and doesn't need to be — nothing here needs Better Auth's own
 *     query builder to know about it.
 *  3. `user.twoFactorEnabled` is true. Defense-in-depth, not the primary
 *     mechanism: verified against
 *     node_modules/better-auth/dist/plugins/two-factor/index.mjs, a
 *     session is normally never created at all for an unverified sign-in
 *     — the twoFactor plugin's post-sign-in hook deletes the session
 *     `/sign-in/email` just created and swaps in a short-lived challenge
 *     cookie instead, so a *live* session already implies MFA passed for
 *     accounts that were enrolled correctly. This check is a cheap backstop
 *     for the case that invariant doesn't cover — an account that reaches
 *     sign-in with `twoFactorEnabled` still false (e.g. an invite-
 *     acceptance transaction, Task 3's job, that didn't finish enrolling
 *     TOTP) — without blocking *session creation* itself the way the
 *     staff-row invariant does in ./index.ts's `databaseHooks`. See
 *     task-2-report.md for why this one is read-side only.
 *  4. `session.userId` resolves to a `staff` row (plan §2.2's last
 *     paragraph). Session *creation* is already blocked for this case by
 *     `databaseHooks.session.create.before` in ./index.ts — this repeats
 *     the check on read so a session created before a `staff` row existed,
 *     or before this code shipped, can't linger.
 *
 * Returns `null` on any failure rather than throwing or redirecting.
 * Redirecting is presentation-layer behaviour (proxy.ts does it for the
 * routes it covers; a page/layout can call `redirect()` itself for the
 * ones outside proxy's matcher) and a bare service (Phase 04) has no
 * request/response cycle to redirect within. Every caller — "every server
 * shell and service", per plan §4.1 — must treat `null` as "not
 * authenticated" and act accordingly; there is no thrown-error path to
 * accidentally not catch.
 */
export async function requireSession(): Promise<AuthedSession | null> {
  const headerList = await nextHeaders();
  return resolveSession(headerList);
}

/**
 * The header-taking core of `requireSession()`, split out so proxy.ts (which
 * has a `NextRequest.headers`, not the `next/headers()` accessor available
 * inside a Server Component/Action) can run the exact same checks. Both
 * layers call this — see plan §4.1: proxy.ts is the optimistic,
 * redirect-based layer; `requireSession()` is the hard per-call layer every
 * shell/service must go through regardless. Sharing the implementation
 * means the two layers can't drift on what "valid" means; each still runs
 * its own DB round trip, so a session touched by proxy.ts and then again by
 * a page's `requireSession()` call bumps `last_seen_at` twice per
 * navigation — accepted duplication, see task-2-report.md.
 */
export async function resolveSession(headers: Headers): Promise<AuthedSession | null> {
  const result = await auth.api.getSession({ headers });
  if (!result) return null;
  const { session, user } = result;

  if (!user.twoFactorEnabled) return null;

  const [sessionRow] = await db
    .select({ lastSeenAt: sessionTable.lastSeenAt })
    .from(sessionTable)
    .where(eq(sessionTable.id, session.id))
    .limit(1);
  if (!sessionRow) return null;

  const idleCutoff = Date.now() - IDLE_TIMEOUT_MS;
  if (sessionRow.lastSeenAt.getTime() < idleCutoff) return null;

  const [staffRow] = await db.select().from(staff).where(eq(staff.userId, user.id)).limit(1);
  if (!staffRow) return null;

  // Only reached once every check above has passed — a rejected request
  // must not look "seen" for the next idle-timeout calculation.
  await db.update(sessionTable).set({ lastSeenAt: new Date() }).where(eq(sessionTable.id, session.id));

  return { user, session, staff: staffRow };
}

/**
 * Resolves the request's client IP the same way Better Auth's own session
 * tracking does (`node_modules/@better-auth/core/dist/utils/ip.mjs`,
 * honouring `advanced.ipAddress` config on the shared `auth` instance),
 * rather than re-deriving forwarded-header parsing here. Used by proxy.ts
 * and by the lockout module's callers (Task 4's login Server Action) to key
 * `auth_attempts.ip` consistently with whatever Better Auth itself would
 * have recorded.
 */
export function resolveClientIp(headers: Headers): string | null {
  return getIp(headers, auth.options);
}
