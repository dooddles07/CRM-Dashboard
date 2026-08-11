import { auditLog } from "@/lib/server/db/audit-log";
import { toDbEnum } from "@/lib/server/db/enum-map";
import type { Tx } from "@/lib/server/db/session";
import type { AuthzSession } from "@/lib/server/authz/policy";
import type { AuditAction } from "@/lib/types";

/**
 * plan/04-service-layer.md §4.1. The audit writer.
 *
 * **Takes `tx`, never `db`.** plan §4.1: "An audit entry that commits
 * independently of the thing it records is worse than none — it can describe
 * a write that rolled back." There is no overload taking a connection, and
 * there should not be one; a caller that has no transaction has no business
 * writing an entry.
 *
 * Actor, IP, user agent, and session id come from `session`, never from a
 * caller argument. docs/API.md §1.3 states this and it survives the move to
 * the server: "a server implementation must take them from the session rather
 * than the request body." A caller cannot claim to be somebody else because
 * there is no parameter in which to make the claim.
 *
 * This is distinct from the private `writeAudit` in
 * lib/server/auth/actions.ts, which writes sign-in, sign-out, and lockout
 * entries. That one runs on `db` deliberately and must keep doing so: it
 * records events for callers who have no session yet — a failed sign-in, or a
 * lockout against an email that never resolved to a staff row — so there is
 * no `tx` and no actor to take fields from. Both write the same table; they
 * differ in whether an actor exists at all.
 */

export interface AuditEntryInput {
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  /** Set for `updated`. One entry per changed field, per §4.2. */
  field?: string;
  previousValue?: string | null;
  newValue?: string | null;
}

/**
 * Request-scoped context the session type does not carry. Resolved once per
 * request by the caller (a Server Action or Phase 05's `handle`) and threaded
 * in, because `next/headers` is not reachable from a service and a service
 * must stay callable from a job.
 */
export interface AuditContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  /**
   * plan/03-authorisation.md §7: every entry made during an impersonated
   * session is stamped with the true actor as well as the impersonated one.
   * `lib/server/authz/impersonation.ts`'s `resolveTrueActor` supplies it.
   */
  impersonatedBy?: string | null;
  /** Denormalised onto the row; see `actorName` below. */
  actorName: string;
}

/**
 * Writes one entry inside the caller's transaction.
 *
 * `actor_name` is denormalised into the row on purpose (plan §4.1): "An entry
 * must stay readable after the staff record is deleted." The foreign key on
 * `actor_id` would otherwise be the only link, and a deleted staff row would
 * leave an audit trail naming nobody.
 */
export async function writeAudit(
  tx: Tx,
  session: AuthzSession,
  context: AuditContext,
  entry: AuditEntryInput,
): Promise<void> {
  await tx.insert(auditLog).values({
    actorId: session.staffId,
    actorName: context.actorName,
    // lib/types.ts spells these kebab-case, the pgEnum snake_case. enum-map is
    // the one place that boundary is crossed.
    action: toDbEnum(entry.action),
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    field: entry.field ?? null,
    previousValue: entry.previousValue ?? null,
    newValue: entry.newValue ?? null,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
    sessionId: context.sessionId ?? null,
    impersonatedBy: session.impersonated ? (context.impersonatedBy ?? null) : null,
  });
}

/**
 * plan §4.2: "`updated` writes one entry per changed field, not one per
 * request. `/admin/audit` renders before and after values per field, and a
 * single row holding a JSON diff cannot fill that table."
 *
 * Compares two flat records and writes an entry per key whose value changed.
 * Values are stringified for storage, since `previous_value` / `new_value`
 * are TEXT and the audit table is read by humans, not re-parsed.
 *
 * Fields holding contact details must not be passed here — the entry would
 * put the plaintext in `new_value`, where anyone with `audit:read` could read
 * every phone number that had ever been edited, with no reveal entry against
 * it. Callers pass the masked form or omit the field.
 */
export async function writeFieldUpdates<T extends Record<string, unknown>>(
  tx: Tx,
  session: AuthzSession,
  context: AuditContext,
  resource: { type: string; id: string },
  before: T,
  after: Partial<T>,
): Promise<number> {
  let written = 0;
  for (const [field, next] of Object.entries(after)) {
    if (next === undefined) continue;
    const previous = before[field];
    if (Object.is(previous, next)) continue;
    await writeAudit(tx, session, context, {
      action: "updated",
      resourceType: resource.type,
      resourceId: resource.id,
      field,
      previousValue: stringify(previous),
      newValue: stringify(next),
    });
    written += 1;
  }
  return written;
}

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : JSON.stringify(value);
}
