import { bigserial, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditAction } from "./schema/enums";
import { inet } from "./schema/columns";
import { staff } from "./schema/people";

/**
 * docs/DATABASE.md §2.7, verbatim, minus the `PARTITION BY RANGE` clause
 * and the partitions themselves — those live in
 * drizzle/manual/0002_audit_log.sql. This file is deliberately outside
 * lib/server/db/schema/ so drizzle-kit generate never sees it (see the
 * comment in lib/server/db/schema/system.ts for why). It exists purely so
 * application code gets typed `db.query.auditLog` / `db.select().from(auditLog)`
 * access, wired in via lib/server/db/index.ts.
 */
export const auditLog = pgTable("audit_log", {
  // The real primary key is the composite (id, occurred_at) — Postgres
  // requires the partition key in every unique constraint on a
  // partitioned table (see drizzle/manual/0002_audit_log.sql). Marked
  // `.primaryKey()` on `id` alone here only so the query builder treats
  // this column as the row identity; it is not diffed against the DB.
  id: bigserial("id", { mode: "number" }).primaryKey(),
  // Nullable as of drizzle/manual/0006_audit_log_actor_nullable.sql (plan
  // §5, Task 2's lockout fan-out): a locked-account audit entry needs to
  // exist even when the attacked email never resolved to a real `staff`
  // row (plan §5's "every lock writes an audit entry" has no carve-out for
  // that case, and losing the record of someone probing a dead address is
  // exactly the visibility a hospital's security posture wants). See
  // lib/server/auth/lockout.ts's `resolveAuditTarget`.
  actorId: uuid("actor_id").references(() => staff.id),
  actorName: text("actor_name").notNull(),
  action: auditAction("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  field: text("field"),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: inet("ip_address"),
  userAgent: text("user_agent"),
  sessionId: uuid("session_id"),
});
