import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { assertHolds, type AuthzSession } from "@/lib/server/authz/policy";
import { writeAudit, type AuditContext } from "@/lib/server/audit/write";
import { withSession } from "@/lib/server/db/session";
import { auditLog } from "@/lib/server/db/audit-log";
import { staff } from "@/lib/server/db/schema/people";
import { fromDbEnum, toDbEnum } from "@/lib/server/db/enum-map";
import type { AuditAction } from "@/lib/types";

/**
 * plan/04-service-layer.md §9: "Read-only. No update or delete function
 * exists."
 *
 * That is the whole design. There is no `update`, no `delete`, no `redact`,
 * and adding one would be a mistake even if it compiled — `careflow_app` has
 * no `UPDATE` or `DELETE` privilege on `audit_log` or its partitions
 * (drizzle/manual/0007 §6), so such a function could only fail at runtime.
 * The absence here and the revoked grant there say the same thing twice,
 * which is the point.
 *
 * Reading requires `audit:read`, held by Super Admin and Hospital Admin only
 * (plan/03 §2.3). The `audit_log_read` policy enforces the same rule in
 * Postgres, so a caller without it sees zero rows even if this check were
 * removed — but they get a clean `AUDIT_ACCESS_DENIED` instead of a
 * confusing empty table, which is the difference between the two layers.
 *
 * ## Cursor pagination, not offset
 *
 * plan §3.1: the audit log "grows without bound and is only ever read in
 * timestamp order, so `OFFSET` on page 700 is a table scan". The cursor is
 * `(occurred_at, id)` because `occurred_at` alone is not unique — two entries
 * written in the same transaction share it, and a cursor on the timestamp
 * would skip or repeat them.
 */

export interface AuditEntryDTO {
  id: string;
  actor: { reference: string; name: string } | null;
  /** Denormalised on the row, so it survives the staff record being deleted. */
  actorName: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  field: string | null;
  previousValue: string | null;
  newValue: string | null;
  occurredAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  /** Set when the action was taken by a Super Admin acting as someone else. */
  impersonatedBy: { reference: string; name: string } | null;
}

export interface AuditFilters {
  action?: AuditAction;
  resourceType?: string;
  resourceId?: string;
  actorId?: string;
  /** Opaque; pass back the `nextCursor` from the previous page. */
  cursor?: string;
  limit?: number;
}

export interface AuditPage {
  data: AuditEntryDTO[];
  nextCursor: string | null;
}

const MAX_LIMIT = 100;

/** `<occurredAtISO>|<id>`. Opaque to callers; parsed only here. */
function parseCursor(cursor: string): { occurredAt: Date; id: number } | null {
  const [at, id] = cursor.split("|");
  const parsedAt = new Date(at ?? "");
  const parsedId = Number(id);
  if (Number.isNaN(parsedAt.getTime()) || !Number.isFinite(parsedId)) return null;
  return { occurredAt: parsedAt, id: parsedId };
}

export async function list(
  session: AuthzSession,
  filters: AuditFilters = {},
): Promise<AuditPage> {
  assertHolds(session, "audit:read");
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(filters.limit ?? 50)));

  return withSession(session, async (tx) => {
    const cursor = filters.cursor ? parseCursor(filters.cursor) : null;

    const impersonator = sql`impersonator`;
    const rows = await tx
      .select({
        id: auditLog.id,
        actorName: auditLog.actorName,
        action: auditLog.action,
        resourceType: auditLog.resourceType,
        resourceId: auditLog.resourceId,
        field: auditLog.field,
        previousValue: auditLog.previousValue,
        newValue: auditLog.newValue,
        occurredAt: auditLog.occurredAt,
        ipAddress: auditLog.ipAddress,
        userAgent: auditLog.userAgent,
        actorReference: staff.reference,
        actorNameJoined: staff.name,
        impersonatorReference: sql<string | null>`${impersonator}.reference`,
        impersonatorName: sql<string | null>`${impersonator}.name`,
      })
      .from(auditLog)
      .leftJoin(staff, eq(staff.id, auditLog.actorId))
      .leftJoin(sql`${staff} AS ${impersonator}`, sql`${impersonator}.id = ${auditLog.impersonatedBy}`)
      .where(
        and(
          filters.action ? eq(auditLog.action, toDbEnum(filters.action)) : undefined,
          filters.resourceType ? eq(auditLog.resourceType, filters.resourceType) : undefined,
          filters.resourceId ? eq(auditLog.resourceId, filters.resourceId) : undefined,
          filters.actorId ? eq(auditLog.actorId, filters.actorId) : undefined,
          // Strictly after the cursor in (occurred_at DESC, id DESC) order.
          cursor
            ? or(
                lt(auditLog.occurredAt, cursor.occurredAt),
                and(eq(auditLog.occurredAt, cursor.occurredAt), lt(auditLog.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
      // One extra row tells us whether another page exists without a count.
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const last = page[page.length - 1];

    return {
      data: page.map((row) => ({
        id: String(row.id),
        actor:
          row.actorReference && row.actorNameJoined
            ? { reference: row.actorReference, name: row.actorNameJoined }
            : null,
        actorName: row.actorName,
        action: fromDbEnum(row.action) as AuditAction,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        field: row.field,
        previousValue: row.previousValue,
        newValue: row.newValue,
        occurredAt: row.occurredAt.toISOString(),
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        impersonatedBy:
          row.impersonatorReference && row.impersonatorName
            ? { reference: row.impersonatorReference, name: row.impersonatorName }
            : null,
      })),
      nextCursor:
        rows.length > limit && last ? `${last.occurredAt.toISOString()}|${last.id}` : null,
    };
  });
}

/**
 * Every entry against one record, for the record's own history panel.
 *
 * Same capability. A patient's audit trail is not less sensitive than the
 * audit screen — arguably more, since it is the list of everyone who has
 * looked at that person.
 */
export async function forResource(
  session: AuthzSession,
  resourceType: string,
  resourceId: string,
  limit = 50,
): Promise<AuditEntryDTO[]> {
  const page = await list(session, { resourceType, resourceId, limit });
  return page.data;
}

/**
 * plan/05-http-api.md §5: an export "writes an audit entry about itself
 * before streaming".
 *
 * The entry is written first and in its own transaction, so a failure to
 * record the export prevents the export. That ordering is the same argument
 * as the reveal transaction's: the record of a bulk disclosure is worth more
 * than the disclosure succeeding.
 *
 * Returns CSV text rather than rows. An export is a file, and building it
 * here keeps the escaping in one place — a handler assembling CSV would be
 * business logic in a route, which plan §2 forbids.
 *
 * Capped at 10,000 rows. An unbounded export of an unbounded table is a
 * memory problem on a free function, and a caller who genuinely needs more
 * should be paginating `list` instead.
 */
export async function exportCsv(
  session: AuthzSession,
  context: AuditContext,
  filters: AuditFilters = {},
): Promise<string> {
  assertHolds(session, "audit:read");
  const limit = Math.min(10_000, Math.max(1, filters.limit ?? 10_000));

  // Written before anything is read, in its own transaction, so it commits
  // even if the export below fails afterwards — the intent to export is the
  // fact worth recording.
  await withSession(session, async (tx) => {
    await writeAudit(tx, session, context, {
      action: "exported",
      resourceType: "audit_log",
      resourceId: filters.resourceId ?? "all",
      field: "filters",
      newValue: JSON.stringify({ ...filters, limit }),
    });
  });

  // Paged through the cursor rather than asking `list` for 10,000 at once:
  // `list` caps `limit` at MAX_LIMIT, so a single call would silently return
  // 100 rows and produce a truncated export that looked complete.
  const entries: AuditEntryDTO[] = [];
  let cursor = filters.cursor;
  while (entries.length < limit) {
    const page = await list(session, {
      ...filters,
      cursor,
      limit: Math.min(MAX_LIMIT, limit - entries.length),
    });
    entries.push(...page.data);
    if (!page.nextCursor || page.data.length === 0) break;
    cursor = page.nextCursor;
  }

  const header = [
    "id",
    "occurred_at",
    "actor_name",
    "action",
    "resource_type",
    "resource_id",
    "field",
    "previous_value",
    "new_value",
    "ip_address",
    "impersonated_by",
  ];

  const rows = entries.map((entry) =>
    [
      entry.id,
      entry.occurredAt,
      entry.actorName,
      entry.action,
      entry.resourceType,
      entry.resourceId,
      entry.field ?? "",
      entry.previousValue ?? "",
      entry.newValue ?? "",
      entry.ipAddress ?? "",
      entry.impersonatedBy?.name ?? "",
    ].map(csvCell),
  );

  return [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

/**
 * RFC 4180 quoting, plus a leading apostrophe on anything a spreadsheet would
 * treat as a formula.
 *
 * `=`, `+`, `-` and `@` at the start of a cell make Excel and Sheets evaluate
 * it, which turns an audit export into a CSV injection vector — an attacker
 * who can get a string into `new_value` can run a formula on the machine of
 * whoever opens the export. The audit log is exactly the file a security
 * reviewer opens.
 */
function csvCell(value: string): string {
  const dangerous = /^[=+\-@\t\r]/.test(value);
  const escaped = (dangerous ? `'${value}` : value).replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * plan/09's anomaly alerting will want this: how many reveals an actor has
 * made in a window. Exposed here rather than in reveal.ts because it is a
 * question about the audit log, and reveal.ts's own budget check is a private
 * concern of that transaction.
 */
export async function revealCountFor(
  session: AuthzSession,
  actorId: string,
  withinHours: number,
): Promise<number> {
  assertHolds(session, "audit:read");

  return withSession(session, async (tx) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.actorId, actorId),
          eq(auditLog.action, "revealed"),
          sql`${auditLog.occurredAt} > now() - (${withinHours} * interval '1 hour')`,
        ),
      );
    return row?.n ?? 0;
  });
}
