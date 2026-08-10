import { sql } from "drizzle-orm";
import { date, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { priority, taskStatus } from "./enums";
import { patients, staff } from "./people";

/**
 * docs/DATABASE.md §2.5. `status` is deliberately not a column — the
 * `follow_ups_with_status` view derives it from `due_date` and
 * `completed_at` so it can never go stale. The view's SQL is given
 * verbatim in that section and is applied as
 * drizzle/manual/0002_follow_ups_view.sql, since Drizzle's schema DSL has
 * no first-class way to track a view built on a CASE expression.
 */
export const followUps = pgTable("follow_ups", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reference: text("reference").notNull().unique(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id),
  type: text("type").notNull(),
  ownerId: uuid("owner_id").references(() => staff.id),
  dueDate: date("due_date").notNull(),
  priority: priority("priority").notNull().default("medium"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** plan/01-foundation.md §4.2, verbatim. */
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reference: text("reference").notNull().unique(),
  title: text("title").notNull(),
  patientId: uuid("patient_id").references(() => patients.id),
  category: text("category").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => staff.id),
  priority: priority("priority").notNull().default("medium"),
  dueDate: date("due_date").notNull(),
  status: taskStatus("status").notNull().default("todo"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
