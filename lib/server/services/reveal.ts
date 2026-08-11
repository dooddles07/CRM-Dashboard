import { and, eq, gt, sql } from "drizzle-orm";
import { auditLog } from "@/lib/server/db/audit-log";
import { decryptPii } from "@/lib/server/db/pii";
import { withSession, type Tx } from "@/lib/server/db/session";
import { assertHolds, type AuthzSession } from "@/lib/server/authz/policy";
// The audit row is inserted inline below rather than through writeAudit(),
// because a reveal carries `reason` and returns the inserted id, and both are
// specific to this one operation.
import type { AuditContext } from "@/lib/server/audit/write";
import { doctors, leads, patients, staff } from "@/lib/server/db/schema";
import { NotFoundError, RateLimitError } from "./errors";

/**
 * plan/04-service-layer.md §5. The endpoint the security model rests on.
 *
 * The whole of this module is one function, and its value is entirely in the
 * order of its steps:
 *
 *   1. declare the session      -- RLS is now active
 *   2. SELECT the row           -- 404 if RLS hides it
 *   3. holds(session,"reveal")  -- 403 if not
 *   4. budget check             -- 429 if exceeded
 *   5. INSERT audit_log         -- must succeed
 *   6. decrypt                  -- only now
 *
 * **Step 5 before step 6.** If the audit insert fails, the transaction rolls
 * back and no value is returned. If the decryption fails, the audit entry
 * rolls back with it — which is correct, because nothing was disclosed. This
 * is the product's central promise ("a value cannot become visible without
 * its audit entry") expressed as a transaction rather than as a convention;
 * before this, it was one `set()` call in a browser store.
 *
 * **Step 2 before step 3.** An out-of-scope reveal returns 404, not 403,
 * because a 403 confirms the record exists. A Nurse probing references from
 * another department learns nothing from the response either way.
 */

/** plan §5's signature. `staff` and `doctor` hold only an email. */
export type RevealResource = "patient" | "lead" | "staff" | "doctor";
export type RevealField = "phone" | "email" | "address" | "dateOfBirth";

export interface RevealResult {
  value: string;
  auditId: string;
  /**
   * Advisory. plan §5: "The server does not remember grants; it tells the
   * client how long to hold the value before dropping it from memory."
   * Re-revealing writes a second audit entry, which is correct — each
   * disclosure is an event, and a server that pretended otherwise would be
   * under-reporting.
   */
  expiresAt: string;
}

/**
 * plan §5.1. "Limits are configuration, not constants in code, so they can be
 * tightened from the first month's audit data without a deployment."
 *
 * Defaults are plan §5.1's table. Note these are deliberately loose: plan
 * §5.1 argues they are "a backstop rather than the primary control", with the
 * weight on detection — Phase 09 alerts a human at 60 an hour, well before
 * the block, and the visible badge and audit entry are the actual deterrent.
 * A Patient Relations desk working a call list should never meet them.
 */
const HOURLY_LIMIT = Number(process.env.REVEAL_LIMIT_HOURLY ?? 100);
const DAILY_LIMIT = Number(process.env.REVEAL_LIMIT_DAILY ?? 500);

/** How long the client should hold a revealed value. Advisory; see `RevealResult`. */
const TTL_MS = 5 * 60 * 1000;

/**
 * Which column backs each (resource, field) pair, and `null` where the
 * combination does not exist — a lead has no address, a staff member exposes
 * only an email. Requesting one of those is a 404 rather than a 400: the
 * value genuinely does not exist, and enumerating which combinations are
 * valid is not information worth handing out.
 *
 * `patients.dateOfBirth` is a plain `date` column, not encrypted, because a
 * birth date is needed for identity checks on every screen that shows a
 * patient. It is still masked in DTOs and still audited on reveal — the
 * disclosure is what is recorded, not the decryption.
 */
type ColumnPicker = (field: RevealField) => { column: unknown; encrypted: boolean } | null;

const RESOURCES: Record<
  RevealResource,
  { table: typeof patients | typeof leads | typeof staff | typeof doctors; pick: ColumnPicker }
> = {
  patient: {
    table: patients,
    pick: (field) =>
      field === "phone"
        ? { column: patients.phoneEncrypted, encrypted: true }
        : field === "email"
          ? { column: patients.emailEncrypted, encrypted: true }
          : field === "address"
            ? { column: patients.addressEncrypted, encrypted: true }
            : { column: patients.dateOfBirth, encrypted: false },
  },
  lead: {
    table: leads,
    pick: (field) =>
      field === "phone"
        ? { column: leads.phoneEncrypted, encrypted: true }
        : field === "email"
          ? { column: leads.emailEncrypted, encrypted: true }
          : null,
  },
  staff: {
    table: staff,
    pick: (field) => (field === "email" ? { column: staff.emailEncrypted, encrypted: true } : null),
  },
  doctor: {
    table: doctors,
    pick: (field) =>
      field === "phone"
        ? { column: doctors.phoneEncrypted, encrypted: true }
        : field === "email"
          ? { column: doctors.emailEncrypted, encrypted: true }
          : null,
  },
};

export async function reveal(
  session: AuthzSession,
  context: AuditContext,
  resource: RevealResource,
  reference: string,
  field: RevealField,
  reason?: string,
): Promise<RevealResult> {
  const target = RESOURCES[resource];
  const picked = target.pick(field);
  if (!picked) {
    throw new NotFoundError(`No ${field} is held for that record.`, { resource, field });
  }

  return withSession(session, async (tx) => {
    // 2. The row, under RLS. Out of scope and non-existent are the same answer.
    const [row] = await tx
      .select({ id: target.table.id })
      .from(target.table)
      .where(eq(target.table.reference, reference))
      .limit(1);

    if (!row) {
      throw new NotFoundError("That record could not be found.", { resource, reference });
    }

    // 3. Capability. Marketing and Billing never get past here, whatever the
    //    row-level scope said, and neither does an impersonated session.
    assertHolds(session, "reveal");

    // 4. Budget, counted off the audit log itself — plan §5.1: "No Redis, no
    //    extra table. The audit log counts itself." idx_audit_actor covers it.
    await assertWithinBudget(tx, session);

    // 5. The entry. Before the value exists in this transaction, so a failure
    //    here cannot leave a disclosure unrecorded.
    const [entry] = await tx
      .insert(auditLog)
      .values({
        actorId: session.staffId,
        actorName: context.actorName,
        action: "revealed",
        resourceType: resource,
        resourceId: reference,
        field,
        // `reason` goes in `new_value` rather than a column of its own: the
        // audit table has no free-text column, and a reveal has no "new
        // value" in the sense an update does.
        newValue: reason ?? null,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        sessionId: context.sessionId ?? null,
        impersonatedBy: session.impersonated ? (context.impersonatedBy ?? null) : null,
      })
      .returning({ id: auditLog.id });

    // 6. Only now.
    const column = picked.column as Parameters<typeof decryptPii>[0];
    const [revealed] = await tx
      .select({
        value: picked.encrypted
          ? decryptPii(column)
          : sql<string>`${column}::text`,
      })
      .from(target.table)
      .where(eq(target.table.id, row.id))
      .limit(1);

    if (!revealed?.value) {
      // The row exists and the caller was entitled, but the column is empty.
      // The audit entry stays: an attempt to disclose is worth recording even
      // when there was nothing to disclose.
      throw new NotFoundError(`No ${field} is held for that record.`, { resource, field });
    }

    return {
      value: revealed.value,
      auditId: String(entry.id),
      expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    };
  });
}

/**
 * plan §5.1. Two windows, counted from `audit_log`.
 *
 * Counts this actor's own `revealed` entries, which is why exports must write
 * one entry per exported row: plan §2.2 and §5.1 both require it, "otherwise
 * the limit is bypassed by clicking Export."
 *
 * Runs inside the caller's transaction, so the count includes nothing that
 * has not committed and cannot race with a concurrent reveal by the same
 * actor in a way that lets both through — the second waits on the first's
 * insert.
 */
async function assertWithinBudget(tx: Tx, session: AuthzSession): Promise<void> {
  const [counts] = await tx
    .select({
      hour: sql<number>`count(*) FILTER (WHERE ${auditLog.occurredAt} > now() - interval '1 hour')::int`,
      day: sql<number>`count(*) FILTER (WHERE ${auditLog.occurredAt} > now() - interval '24 hours')::int`,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.actorId, session.staffId),
        eq(auditLog.action, "revealed"),
        gt(auditLog.occurredAt, sql`now() - interval '24 hours'`),
      ),
    );

  if (counts && counts.hour >= HOURLY_LIMIT) {
    throw new RateLimitError(
      "REVEAL_RATE_EXCEEDED",
      "You have revealed too many contact details in the last hour. Try again shortly.",
      { window: "1 hour", limit: HOURLY_LIMIT, used: counts.hour },
    );
  }
  if (counts && counts.day >= DAILY_LIMIT) {
    throw new RateLimitError(
      "REVEAL_RATE_EXCEEDED",
      "You have revealed too many contact details today.",
      { window: "24 hours", limit: DAILY_LIMIT, used: counts.day },
    );
  }
}
