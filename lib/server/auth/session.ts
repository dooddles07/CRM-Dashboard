import { headers as nextHeaders } from "next/headers";
import { eq } from "drizzle-orm";
import { getIp } from "@better-auth/core/utils/ip";
import { auth } from "./index";
import { db } from "@/lib/server/db";
import { session as sessionTable } from "@/lib/server/db/schema/auth";
import { staff } from "@/lib/server/db/schema/people";
import { authzSession, type AuthzSession } from "@/lib/server/authz/policy";

/** plan/02-authentication.md §4: "Idle timeout | 30 minutes". */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** plan/03-authorisation.md §7: impersonation "caps the session at 30 minutes". */
const IMPERSONATION_MAX_MS = 30 * 60 * 1000;

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
  /**
   * Phase 03. The four fields every authorisation decision is made about,
   * with `staff.role`'s TEXT already narrowed to one of the nine roles.
   *
   * Resolved here rather than by each caller so that no consumer can build
   * one incorrectly — in particular, `impersonated` is read from the
   * `session` row's `impersonated_by` column, which a caller holding only a
   * `staff` row could not know about, and which plan §7 makes decisive for
   * whether this session may reveal PII.
   */
  authz: AuthzSession;
}

/**
 * Resolves and validates the current request's session against every
 * server-side invariant plan §4 requires:
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
 *  3. `session.userId` resolves to a `staff` row (plan §2.2's last
 *     paragraph). Session *creation* is already blocked for this case by
 *     `databaseHooks.session.create.before` in ./index.ts — this repeats
 *     the check on read so a session created before a `staff` row existed,
 *     or before this code shipped, can't linger.
 *
 * No longer checks `user.twoFactorEnabled` — MFA enforcement was turned off
 * (password-only login). The `twoFactor` plugin, `/mfa`, and the enrolment
 * actions in ./actions.ts are still wired up but unreached in the normal
 * sign-in flow now that no account requires a second factor.
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

  const [sessionRow] = await db
    .select({ lastSeenAt: sessionTable.lastSeenAt, impersonatedBy: sessionTable.impersonatedBy })
    .from(sessionTable)
    .where(eq(sessionTable.id, session.id))
    .limit(1);
  if (!sessionRow) return null;

  const idleCutoff = Date.now() - IDLE_TIMEOUT_MS;
  if (sessionRow.lastSeenAt.getTime() < idleCutoff) return null;

  const [staffRow] = await db.select().from(staff).where(eq(staff.userId, user.id)).limit(1);
  if (!staffRow) return null;

  // plan/03-authorisation.md §7: an impersonated session is capped at 30
  // minutes regardless of the 12-hour absolute ceiling everything else
  // runs under. Enforced here, on the read path, for the same reason the
  // idle timeout is: it is the one check every consumer goes through.
  if (sessionRow.impersonatedBy) {
    const startedAt = session.createdAt?.getTime() ?? 0;
    if (Date.now() - startedAt > IMPERSONATION_MAX_MS) return null;
  }

  // Only reached once every check above has passed — a rejected request
  // must not look "seen" for the next idle-timeout calculation.
  await db.update(sessionTable).set({ lastSeenAt: new Date() }).where(eq(sessionTable.id, session.id));

  // Throws UnknownRoleError if `staff.role` is not one of the nine. That is
  // deliberate and deliberately loud: the database refuses to store any
  // other value (`staff_role_known`, drizzle/manual/0007_row_level_security.sql
  // §1), so reaching this line with a bad role means the constraint and
  // lib/server/authz/matrix.ts have diverged — a bug that must not degrade
  // into a quietly under-privileged session. See policy.ts's `authzSession`.
  const authz = authzSession({
    staffId: staffRow.id,
    role: staffRow.role,
    departmentId: staffRow.departmentId,
    impersonated: Boolean(sessionRow.impersonatedBy),
  });

  return { user, session, staff: staffRow, authz };
}

/**
 * Resolves the request's client IP the same way Better Auth's own session
 * tracking does (`node_modules/@better-auth/core/dist/utils/ip.mjs`,
 * honouring `advanced.ipAddress` config on the shared `auth` instance),
 * rather than re-deriving forwarded-header parsing here. proxy.ts doesn't
 * need this — it only checks session validity, not lockout — this is for
 * lib/server/auth/lockout.ts's callers (Task 4's login/mfa Server Actions)
 * to key `auth_attempts.ip` consistently with whatever Better Auth itself
 * would have recorded.
 */
export function resolveClientIp(headers: Headers): string | null {
  return getIp(headers, auth.options);
}
