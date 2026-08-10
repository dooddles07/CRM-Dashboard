import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { bytea } from "./columns";
import { integrationStatus, notificationCategory, tone } from "./enums";
import { staff } from "./people";

// audit_log is NOT declared here. It is partitioned (docs/DATABASE.md
// §2.7), and Postgres can only declare a table partitioned at CREATE TABLE
// time — there is no ALTER path onto an existing table. drizzle-kit
// generate diffs every table exported from anything this directory's glob
// resolves, with no per-table exclusion for that command (tablesFilter
// only affects `db push`), so the only reliable exclusion is to keep the
// table's definition entirely outside lib/server/db/schema/. Its full
// CREATE TABLE ... PARTITION BY RANGE lives in
// drizzle/manual/0002_audit_log.sql, and its Drizzle definition — for
// typed application queries only, never diffed — lives in
// lib/server/db/audit-log.ts.

/** plan/01-foundation.md §4.7, verbatim. Per-staff rows, not a shared global list. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    category: notificationCategory("category").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href").notNull(),
    tone: tone("tone").notNull().default("neutral"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_notifications_unread")
      .on(table.staffId, table.createdAt.desc())
      .where(sql`${table.readAt} IS NULL`),
  ],
);

export const userPreferences = pgTable("user_preferences", {
  staffId: uuid("staff_id")
    .primaryKey()
    .references(() => staff.id, { onDelete: "cascade" }),
  density: text("density").notNull().default("comfortable"),
  theme: text("theme").notNull().default("system"),
  railCollapsed: boolean("rail_collapsed").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  status: integrationStatus("status").notNull().default("disconnected"),
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
  secretEncrypted: bytea("secret_encrypted"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
