import { headers as nextHeaders } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { requireSession, resolveClientIp } from "@/lib/server/auth/session";
import { db } from "@/lib/server/db";
import { auditLog } from "@/lib/server/db/audit-log";
import { staff } from "@/lib/server/db/schema/people";
import { ForbiddenError } from "./policy";

/**
 * plan/03-authorisation.md §7. Better Auth's admin plugin can impersonate;
 * this module is the conditions the plan attaches to it, without which
 * "impersonation is a hole large enough to make the rest of this phase
 * decorative":
 *
 *   1. restricted to Super Admin      — `assertMayImpersonate` below
 *   2. audit entry on start and end   — `startImpersonation` / `stopImpersonation`
 *   3. every entry during the session stamped with the true actor
 *                                     — `audit_log.impersonated_by`
 *                                       (drizzle/manual/0008_impersonation_audit.sql),
 *                                       resolved by `resolveTrueActor`
 *   4. capped at 30 minutes           — lib/server/auth/session.ts's
 *                                       IMPERSONATION_MAX_MS, enforced on read
 *   5. cannot reveal PII              — ./policy.ts's `holds`, which has to
 *                                       cover every reveal call site rather
 *                                       than only the two functions here
 *
 * **This file deliberately carries no `"use server"` directive.** Marking it
 * so would publish every export as an RPC endpoint the browser can call by
 * name — including `resolveTrueActor`, which takes a session id and returns a
 * staff member's name, and which nothing outside the server has any business
 * calling. A UI affordance for impersonation belongs in its own `"use server"`
 * module that exports only the two entry points and re-checks the caller.
 *
 * Nor is there an HTTP surface: Better Auth's own
 * `/api/auth/admin/impersonate-user` route is unreachable, since this project
 * mounts no `app/api/auth/[...all]/route.ts` (see lib/server/auth/index.ts).
 * `auth.api.impersonateUser` is therefore callable only from server code, and
 * this module is the only server code that calls it — which is what makes the
 * Super Admin check below sufficient rather than merely advisory.
 */

/** Thrown when there is no session at all. A 401, distinct from ForbiddenError's 403. */
export class UnauthenticatedError extends Error {
  readonly name = "UnauthenticatedError";
  constructor() {
    super("You are not signed in.");
  }
}

/**
 * plan §7: "It is enabled, restricted to Super Admin".
 *
 * Restricted on `staff.role` — this product's nine-role matrix — rather than
 * on the admin plugin's own `user.role` column, which is a separate field
 * that nothing in this codebase ever sets. Checking the one `/admin/roles`
 * displays and row-level security enforces means there is a single answer to
 * "who is a Super Admin" rather than two that can disagree.
 */
async function assertMayImpersonate() {
  const authed = await requireSession();
  if (!authed) throw new UnauthenticatedError();

  if (authed.authz.role !== "Super Admin") {
    throw new ForbiddenError("Only a Super Admin can act as another user.", {
      role: authed.authz.role,
      area: "users",
      level: "full",
    });
  }

  // Impersonating from inside an impersonated session would make the true
  // actor ambiguous — `impersonated_by` holds one id, not a chain — and there
  // is no use for it. Refused rather than modelled.
  if (authed.authz.impersonated) {
    throw new ForbiddenError("You are already acting as another user.", {
      role: authed.authz.role,
      area: "users",
      level: "full",
    });
  }

  return authed;
}

/**
 * Writes the start entry, then hands over to Better Auth.
 *
 * Order matters. The entry is written *before* the session swaps: once
 * `impersonateUser` returns, the cookie identifies the target, and an audit
 * write after that point would have to reconstruct the real actor from a
 * session that no longer names them. Writing first means the worst failure is
 * an entry for an impersonation that then did not start — a false positive in
 * the audit log, which is the direction to err in.
 */
export async function startImpersonation(targetStaffId: string): Promise<{ ok: true }> {
  const authed = await assertMayImpersonate();
  const headerList = await nextHeaders();

  const [target] = await db
    .select({ id: staff.id, userId: staff.userId, name: staff.name })
    .from(staff)
    .where(eq(staff.id, targetStaffId))
    .limit(1);

  if (!target?.userId) {
    // No such staff member, or one that never completed provisioning and so
    // has no `user` row to impersonate. Same answer either way: plan §8's
    // "out of scope is indistinguishable from not existing".
    throw new ForbiddenError("That user cannot be impersonated.", {
      role: authed.authz.role,
      area: "users",
      level: "full",
    });
  }

  await db.insert(auditLog).values({
    actorId: authed.authz.staffId,
    actorName: authed.staff.name,
    action: "impersonation_started",
    resourceType: "staff",
    resourceId: target.id,
    newValue: target.name,
    ipAddress: resolveClientIp(headerList),
    // The start and end entries are the two whose actor *is* the Super Admin,
    // so stamping both sides here makes the pair legible from either.
    impersonatedBy: authed.authz.staffId,
  });

  await auth.api.impersonateUser({
    body: { userId: target.userId },
    headers: headerList,
  });

  return { ok: true };
}

/**
 * plan §7's other half. Writes the end entry attributed to the true actor,
 * read off the session row before Better Auth tears it down.
 *
 * A no-op for a session that is not impersonating, rather than an error: this
 * is the kind of thing a UI calls on a button that may already have been
 * pressed, and the 30-minute cap can end the session underneath it.
 */
export async function stopImpersonation(): Promise<{ ok: true }> {
  const authed = await requireSession();
  if (!authed) throw new UnauthenticatedError();
  if (!authed.authz.impersonated) return { ok: true };

  const headerList = await nextHeaders();
  const trueActor = await resolveTrueActor(authed.session.id);

  await db.insert(auditLog).values({
    actorId: trueActor?.id ?? null,
    actorName: trueActor?.name ?? "Unknown",
    action: "impersonation_ended",
    resourceType: "staff",
    resourceId: authed.authz.staffId,
    previousValue: authed.staff.name,
    ipAddress: resolveClientIp(headerList),
    impersonatedBy: trueActor?.id ?? null,
  });

  await auth.api.stopImpersonating({ headers: headerList });
  return { ok: true };
}

/**
 * The staff row behind `session.impersonated_by`.
 *
 * That column holds a Better Auth `user.id`, not a `staff.id` — Better Auth
 * owns it and knows nothing about this product's `staff` table — so the join
 * goes through `staff.user_id` and no foreign key declares it. Hence raw SQL
 * rather than a Drizzle relation.
 *
 * Exported because plan §7's third condition applies to *every* entry written
 * during an impersonated session, not just the closing one: Phase 04's audit
 * writer calls this to fill `impersonated_by` on each write it makes while
 * `session.authz.impersonated` is true.
 */
export async function resolveTrueActor(
  sessionId: string,
): Promise<{ id: string; name: string } | null> {
  const result = await db.execute<{ id: string; name: string }>(sql`
    SELECT s.id, s.name
    FROM session sess
    JOIN staff s ON s.user_id = sess.impersonated_by
    WHERE sess.id = ${sessionId}
    LIMIT 1
  `);
  const row = result.rows[0];
  return row ? { id: row.id, name: row.name } : null;
}
