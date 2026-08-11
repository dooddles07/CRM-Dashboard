import { sql } from "drizzle-orm";
import { db, type Database } from "./index";
import { DEPARTMENT_SCOPE } from "@/lib/server/authz/matrix";
import type { AuthzSession } from "@/lib/server/authz/policy";

/**
 * plan/03-authorisation.md §5.1. The only way to reach patient data.
 *
 * Every query runs inside a transaction that declares who is asking, before
 * it reads anything. The three `app.*` settings this writes are what the
 * row-level security policies in drizzle/manual/0007_rls.sql read; a query
 * that runs outside this helper reaches those policies with nothing set, and
 * `app_role()` raises rather than returning zero rows (see that migration's
 * §2 for why raising, not filtering, is the required behaviour — plan §8:
 * "A query issued outside `withSession` fails rather than returning unscoped
 * rows").
 *
 * plan §5.1: "Services never touch `db` directly. They receive `tx`. That is
 * the mechanism — if a query can only run inside `withSession`, it can only
 * run with a role declared." Phase 04's services take `(session, ...)` and
 * get their `tx` from here; nothing in `lib/server/services/` should import
 * `db`.
 */

/**
 * The transaction handle a service receives. Derived from the driver's own
 * type rather than written out, so a driver change (Phase 01 §8 left the
 * door open to one) doesn't leave a hand-copied type behind.
 */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Thrown when a department-scoped role has no department. plan §4 gives
 * Manager, Doctor, and Nurse "own department" scope; a row in that set with
 * `department_id` NULL can be authorised for nothing, and the RLS policies
 * would express that as zero rows everywhere — plan §5.3's empty-set failure
 * mode, "a screen showing an empty state looks like a data problem rather
 * than a permissions bug".
 *
 * The database refuses to create such a row (`staff_department_required`, in
 * drizzle/manual/0007_rls.sql §1). This is the same invariant restated where
 * it can name the staff member.
 */
export class UnscopedSessionError extends Error {
  readonly name = "UnscopedSessionError";
  constructor(session: AuthzSession) {
    super(
      `Staff ${session.staffId} holds the department-scoped role "${session.role}" but has no department. ` +
        `Assign a department or change the role; this session can be authorised for nothing as it stands.`,
    );
  }
}

/**
 * plan §5.1, with the plan's own snippet as its body.
 *
 * `set_config(..., true)` — the third argument — is transaction-local.
 * plan §5.1: "It cannot leak into a pooled connection's next occupant, which
 * is the failure mode that makes naive `SET` dangerous on serverless." That
 * matters here specifically: `db` is the pooled Neon connection
 * (lib/server/db/index.ts), so the connection serving this request is very
 * likely to serve a different staff member's next one.
 *
 * `departmentId` is passed as `''` rather than NULL when absent, because
 * `set_config`'s value parameter is `text` and a NULL there sets the GUC to
 * NULL, which `current_setting` then reports identically to "never set" —
 * collapsing "this role has no department" into "nobody declared a session",
 * which are two very different failures. The SQL side treats `''` as "no
 * department" explicitly.
 */
export async function withSession<T>(
  session: AuthzSession,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (DEPARTMENT_SCOPE[session.role] === "own-department" && !session.departmentId) {
    throw new UnscopedSessionError(session);
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT set_config('app.staff_id',      ${session.staffId},          true),
             set_config('app.role',          ${session.role},             true),
             set_config('app.department_id', ${session.departmentId ?? ""}, true)
    `);
    return fn(tx);
  });
}
